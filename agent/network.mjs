// Dispositivos de la red local, sin credenciales del router: solo lectura y solo dentro de la subred del PC.
//
// 1. Sondeo ARP: se envía un datagrama UDP vacío a cada IP de la subred. Para enviarlo, el sistema tiene que
//    resolver la MAC por ARP, y cualquier equipo encendido responde a ARP aunque su cortafuegos ignore el ping.
//    Al cabo de unos segundos, las entradas "alcanzables" de la tabla de vecinos son los equipos en línea.
// 2. Nombres: DNS inverso, mDNS (Apple, Android, Linux, impresoras), NetBIOS (Windows) y SSDP/UPnP (teles,
//    reproductores, routers). Cada fuente aporta lo que sabe; manda el inventario agent/devices.json.
// 3. Historial en agent/state.json: desde cuándo está conectado cada equipo y cuándo se vio por última vez.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, fallback = null) => Promise.race([p.catch(() => fallback), sleep(ms).then(() => fallback)]);

// --- direcciones ---------------------------------------------------------------------------
const ipToInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
const intToIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
export const normMac = (m) => String(m || '').toLowerCase().replace(/[^0-9a-f]/g, '').replace(/(..)(?!$)/g, '$1:');
// Segundo bit del primer byte: dirección administrada localmente (MAC privada o aleatoria de móviles y tablets).
const isRandomMac = (mac) => (parseInt(mac.slice(0, 2), 16) & 2) === 2;
const isPrivateIp = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

// Interfaz del PC que está en la misma subred que la puerta de enlace (o la primera IPv4 privada).
function localInterface(gateway) {
  const all = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal && isPrivateIp(a.address));
  const same = (a) => gateway && (ipToInt(a.address) & ipToInt(a.netmask)) === (ipToInt(gateway) & ipToInt(a.netmask));
  return all.find(same) || all[0] || null;
}

// IPs a sondear. Una subred mayor que /22 se limita a la /24 del PC para que el barrido siga siendo corto.
function hostsOf(iface) {
  let mask = ipToInt(iface.netmask);
  if (((~mask) >>> 0) > 1023) mask = ipToInt('255.255.255.0');
  const net = (ipToInt(iface.address) & mask) >>> 0;
  const broadcast = (net | (~mask >>> 0)) >>> 0;
  const out = [];
  for (let n = net + 1; n < broadcast; n++) if (n !== ipToInt(iface.address)) out.push(intToIp(n));
  return { hosts: out, subnet: `${intToIp(net)}/${countBits(mask)}` };
}
const countBits = (n) => n.toString(2).replace(/0/g, '').length;

// --- sondeo y tabla de vecinos ---------------------------------------------------------------
async function probe(hosts) {
  const sock = dgram.createSocket('udp4');
  sock.on('error', () => {});
  const burst = () => hosts.forEach((ip) => sock.send(Buffer.alloc(1), 9, ip, () => {}));
  burst();
  await sleep(1500);
  burst(); // segunda pasada para los equipos que tardan en despertar la Wi-Fi
  // Windows pasa las entradas de Delay a Probe y luego a Reachable o Unreachable en unos 8 s.
  await sleep(8000);
  sock.close();
}

const PS_NEIGHBORS = `
$gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1).NextHop
$n = Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object { @{ ip = $_.IPAddress; mac = $_.LinkLayerAddress; state = [string]$_.State } }
@{ gateway = $gw; neighbors = @($n) } | ConvertTo-Json -Depth 3 -Compress`;

// Devuelve la puerta de enlace y los vecinos con estado: online = respondió a ARP en este barrido.
async function neighbors() {
  if (process.platform === 'win32') {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_NEIGHBORS], { windowsHide: true, timeout: 30_000 });
    const j = JSON.parse(stdout);
    return {
      gateway: j.gateway || null,
      list: (j.neighbors || []).map((x) => ({ ip: x.ip, mac: normMac(x.mac), online: ['Reachable', 'Delay', 'Probe'].includes(x.state), state: x.state })),
    };
  }
  if (process.platform === 'linux') {
    const route = JSON.parse((await run('ip', ['-j', 'route', 'show', 'default'])).stdout || '[]');
    const neigh = JSON.parse((await run('ip', ['-j', '-4', 'neigh'])).stdout || '[]');
    return {
      gateway: route[0]?.gateway || null,
      list: neigh.filter((x) => x.lladdr).map((x) => ({ ip: x.dst, mac: normMac(x.lladdr), online: (x.state || []).some((s) => ['REACHABLE', 'DELAY', 'PROBE'].includes(s)), state: (x.state || []).join(',') })),
    };
  }
  // Otros sistemas: `arp -an` no da el estado, así que se toma como en línea todo lo que aparece.
  const { stdout } = await run('arp', ['-an']);
  const list = [...stdout.matchAll(/\((\d+\.\d+\.\d+\.\d+)\) at ([0-9a-f:]{11,17})/gi)].map((m) => ({ ip: m[1], mac: normMac(m[2]), online: true }));
  return { gateway: null, list };
}

const usable = (x, hosts) => x.mac && x.mac !== 'ff:ff:ff:ff:ff:ff' && !x.mac.startsWith('01:00:5e') && x.mac !== '00:00:00:00:00:00' && hosts.has(x.ip);

// Con varios adaptadores (VPN, WSL, Hyper-V) el multicast saldría por cualquiera: se fija el de la LAN.
async function bindTo(sock, local) {
  await new Promise((r) => sock.bind(0, local, r));
  try {
    sock.setMulticastInterface(local);
  } catch {}
}

// --- paquetes DNS mínimos (mDNS y NetBIOS) ------------------------------------------------------
function encodeName(name) {
  const parts = name.split('.').filter(Boolean).map((l) => Buffer.concat([Buffer.from([Buffer.byteLength(l)]), Buffer.from(l)]));
  return Buffer.concat([...parts, Buffer.from([0])]);
}

function readName(buf, offset) {
  const labels = [];
  let pos = offset;
  let end = null;
  for (let guard = 0; guard < 64 && pos < buf.length; guard++) {
    const len = buf[pos];
    if (len === 0) { pos += 1; break; }
    if ((len & 0xc0) === 0xc0) {
      if (end === null) end = pos + 2;
      pos = ((len & 0x3f) << 8) | buf[pos + 1];
      continue;
    }
    labels.push(buf.toString('utf8', pos + 1, pos + 1 + len));
    pos += 1 + len;
  }
  return { name: labels.join('.'), next: end ?? pos };
}

// Primer registro PTR de la respuesta.
function parsePtr(buf) {
  if (buf.length < 12) return null;
  const qd = buf.readUInt16BE(4);
  const an = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10);
  let pos = 12;
  for (let i = 0; i < qd; i++) pos = readName(buf, pos).next + 4;
  for (let i = 0; i < an && pos < buf.length; i++) {
    const rr = readName(buf, pos);
    pos = rr.next;
    const type = buf.readUInt16BE(pos);
    const len = buf.readUInt16BE(pos + 8);
    if (type === 12) return { owner: rr.name, value: readName(buf, pos + 10).name };
    pos += 10 + len;
  }
  return null;
}

const reverseName = (ip) => `${ip.split('.').reverse().join('.')}.in-addr.arpa`;

// mDNS inverso: se pregunta por d.c.b.a.in-addr.arpa al grupo multicast desde un puerto propio, así que
// los equipos responden por unicast a este socket ("legacy unicast", RFC 6762 §6.7).
async function mdnsNames(ips, local) {
  const names = new Map();
  if (!ips.length) return names;
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.on('message', (msg) => {
    const ptr = parsePtr(msg);
    const m = ptr?.owner.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\.in-addr\.arpa$/i);
    if (m && ptr.value) names.set([m[4], m[3], m[2], m[1]].join('.'), ptr.value.replace(/\.local$/i, ''));
  });
  await bindTo(sock, local);
  ips.forEach((ip, i) => {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(i + 1, 0);
    header.writeUInt16BE(1, 4);
    const q = Buffer.concat([header, encodeName(reverseName(ip)), Buffer.from([0, 12, 0x80, 1])]); // PTR, clase IN con bit QU
    sock.send(q, 5353, '224.0.0.251', () => {});
  });
  await sleep(2500);
  sock.close();
  return names;
}

// NetBIOS Node Status (UDP 137): el nombre del equipo en PCs Windows y algunos NAS.
const NBSTAT = Buffer.concat([
  Buffer.from([0x13, 0x37, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0x20]),
  Buffer.from('CK' + 'A'.repeat(30)),
  Buffer.from([0, 0, 0x21, 0, 1]),
]);
async function netbiosNames(ips, local) {
  const names = new Map();
  if (!ips.length) return names;
  const sock = dgram.createSocket('udp4');
  sock.on('error', () => {});
  sock.on('message', (msg, rinfo) => {
    try {
      let pos = 12 + 34 + 10; // cabecera, nombre, tipo/clase/TTL/longitud
      const count = msg[pos++];
      for (let i = 0; i < count; i++, pos += 18) {
        const flags = msg.readUInt16BE(pos + 16);
        if (msg[pos + 15] === 0 && !(flags & 0x8000)) {
          names.set(rinfo.address, msg.toString('latin1', pos, pos + 15).trim());
          break;
        }
      }
    } catch {}
  });
  await bindTo(sock, local);
  ips.forEach((ip) => sock.send(NBSTAT, 137, ip, () => {}));
  await sleep(2000);
  sock.close();
  return names;
}

// SSDP: teles, reproductores, consolas y routers anuncian una descripción XML con nombre y modelo.
async function ssdpInfo(hosts, local) {
  const locations = new Map();
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.on('message', (msg, rinfo) => {
    const loc = String(msg).match(/^location:\s*(\S+)/im)?.[1];
    if (loc && hosts.has(rinfo.address) && !locations.has(rinfo.address)) locations.set(rinfo.address, loc);
  });
  await bindTo(sock, local);
  const search = 'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n';
  sock.send(search, 1900, '239.255.255.250', () => {});
  await sleep(800);
  sock.send(search, 1900, '239.255.255.250', () => {});
  await sleep(2500);
  sock.close();

  const info = new Map();
  const tag = (xml, t) => xml.match(new RegExp(`<${t}>([^<]{1,80})</${t}>`, 'i'))?.[1]?.trim();
  await Promise.all(
    [...locations].map(async ([ip, loc]) => {
      try {
        const url = new URL(loc);
        // Solo se lee la descripción servida por el propio equipo que respondió, nunca otra dirección.
        if (url.protocol !== 'http:' || url.hostname !== ip) return;
        const res = await fetch(url, { signal: AbortSignal.timeout(2500), redirect: 'error' });
        const xml = (await res.text()).slice(0, 64_000);
        info.set(ip, { name: tag(xml, 'friendlyName'), model: tag(xml, 'modelName'), maker: tag(xml, 'manufacturer'), deviceType: tag(xml, 'deviceType') });
      } catch {}
    }),
  );
  return info;
}

async function reverseDns(ips) {
  const names = new Map();
  await Promise.all(
    ips.map(async (ip) => {
      const r = await withTimeout(dns.promises.reverse(ip), 1500, []);
      if (r?.[0]) names.set(ip, r[0].replace(/\.(local|lan|home|localdomain)$/i, ''));
    }),
  );
  return names;
}

// --- tipo de dispositivo ---------------------------------------------------------------------
export const TYPES = [
  'router', 'ap', 'switch', 'powerline', 'tv', 'streamer', 'pc', 'laptop', 'tablet', 'phone', 'ereader', 'console',
  'printer', 'speaker', 'camera', 'nas', 'server', 'iot', 'light', 'plug', 'watch', 'unknown',
];
const GUESS = [
  [/router|gateway|internetgatewaydevice|fritz|livebox|hgu/i, 'router'],
  [/repeater|extender|access.?point|mesh|deco|eero|orbi/i, 'ap'],
  [/powerline|devolo|plc/i, 'powerline'],
  [/fire.?tv|chromecast|roku|apple.?tv|shield|mi.?box|tv.?box|android.?tv|stick/i, 'streamer'],
  [/\btv\b|television|webos|bravia|tizen|mediarenderer|smarttv/i, 'tv'],
  [/iphone|android|pixel|galaxy|redmi|xiaomi|oneplus|phone|moto/i, 'phone'],
  [/ipad|tablet|tab\b/i, 'tablet'],
  [/kindle|kobo|ereader/i, 'ereader'],
  [/macbook|laptop|notebook|thinkpad/i, 'laptop'],
  [/playstation|ps[45]|xbox|nintendo|switch|steam.?deck/i, 'console'],
  [/printer|epson|brother|canon|hp[-_ ]?(laserjet|deskjet|envy|officejet)|ipp/i, 'printer'],
  [/sonos|echo|alexa|homepod|nest.?(mini|audio)|speaker|soundbar|denon|yamaha/i, 'speaker'],
  [/camera|cam\b|ipc|doorbell|ring/i, 'camera'],
  [/synology|qnap|diskstation|nas\b/i, 'nas'],
  [/raspberry|server|proxmox|homeassistant|home-assistant/i, 'server'],
  [/watch/i, 'watch'],
  [/bulb|light|hue|lamp/i, 'light'],
  [/plug|socket|shelly|tasmota|sonoff/i, 'plug'],
  [/esp[-_]?\w+|tuya|iot|sensor|thermostat/i, 'iot'],
  [/desktop|pc\b|win|workstation/i, 'pc'],
];
const guessType = (...hints) => {
  const s = hints.filter(Boolean).join(' ');
  return GUESS.find(([re]) => re.test(s))?.[1] || 'unknown';
};

// Fabricantes de chips muy comunes en domótica, para nombrar y clasificar lo que no se presenta por la red.
const ESPRESSIF = '08:3a:f2 10:52:1c 24:0a:c4 24:6f:28 2c:f4:32 30:ae:a4 34:94:54 3c:71:bf 40:f5:20 48:3f:da 4c:11:ae 50:02:91 5c:cf:7f 60:01:94 68:c6:3a 70:03:9f 7c:9e:bd 80:7d:3a 84:0d:8e 84:cc:a8 84:f3:eb 8c:aa:b5 98:f4:ab a0:20:a6 a4:7b:9d a4:cf:12 ac:67:b2 b4:e6:2d bc:dd:c2 c4:4f:33 c8:2b:96 c8:c9:a3 cc:50:e3 d8:a0:1d dc:4f:22 e0:98:06 e8:68:e7 e8:db:84 ec:fa:bc f4:cf:a2';
const VENDORS = new Map(ESPRESSIF.split(' ').map((p) => [p, { vendor: 'Espressif', type: 'iot' }]));
const vendorOf = (mac) => VENDORS.get(mac.slice(0, 8)) || null;

// --- inventario --------------------------------------------------------------------------------
// agent/devices.json (no se sube a git): nombre, tipo, conexión y de qué equipo cuelga cada MAC.
export function loadInventory(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(j) ? j : j.devices || [];
    return new Map(list.filter((d) => d.mac).map((d) => [normMac(d.mac), { ...d, mac: normMac(d.mac) }]));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`devices.json: ${err.message}`);
    return new Map();
  }
}

// --- barrido completo -----------------------------------------------------------------------------
// prev: lo guardado en la pasada anterior ({ scannedAt, devices: { mac: {...} } }).
export async function scanNetwork(prev = {}, { inventoryFile, forgetDays = 7, gapMin = 15 } = {}) {
  const inventory = loadInventory(inventoryFile);
  const before = await neighbors();
  const iface = localInterface(before.gateway);
  if (!iface) throw new Error('sin interfaz IPv4 privada');
  const { hosts, subnet } = hostsOf(iface);
  const hostSet = new Set(hosts);
  await probe(hosts);
  const after = await neighbors();
  const gateway = after.gateway || before.gateway;

  const seen = new Map();
  for (const x of after.list) if (usable(x, hostSet) && x.online) seen.set(x.mac, x.ip);
  const selfMac = normMac(iface.mac);
  seen.set(selfMac, iface.address);

  const onlineIps = [...seen.values()].filter((ip) => ip !== iface.address);
  const [mdns, netbios, ssdp, rdns] = await Promise.all([
    mdnsNames(onlineIps, iface.address),
    netbiosNames(onlineIps, iface.address),
    ssdpInfo(hostSet, iface.address),
    reverseDns(onlineIps),
  ]);

  const now = new Date();
  const nowIso = now.toISOString();
  // Si la pasada anterior es reciente, un equipo que sigue en línea conserva su hora de conexión.
  const continuous = prev.scannedAt && now - new Date(prev.scannedAt) <= gapMin * 60_000;
  const store = {};
  const devices = [];
  const macs = new Set([...seen.keys(), ...inventory.keys(), ...Object.keys(prev.devices || {})]);

  for (const mac of macs) {
    const inv = inventory.get(mac);
    const old = prev.devices?.[mac] || {};
    const ip = seen.get(mac) || inv?.ip || old.ip || null;
    const online = seen.has(mac);
    const lastSeen = online ? nowIso : old.lastSeen || null;
    if (!inv && !online && (!lastSeen || now - new Date(lastSeen) > forgetDays * 864e5)) continue;

    const found = {
      mdns: online ? mdns.get(ip) : undefined,
      netbios: online ? netbios.get(ip) : undefined,
      dns: online ? rdns.get(ip) : undefined,
      ssdp: online ? ssdp.get(ip)?.name : undefined,
    };
    const names = { ...old.names, ...Object.fromEntries(Object.entries(found).filter(([, v]) => v)) };
    const ss = online ? ssdp.get(ip) : null;
    const model = ss?.model ? [ss.maker, ss.model].filter(Boolean).join(' ') : old.model;
    const isSelf = mac === selfMac;
    const isGateway = ip === gateway;
    const autoName = isSelf ? os.hostname() : names.ssdp || names.mdns || names.netbios || names.dns || null;
    const vendor = vendorOf(mac);
    const guessed = guessType(autoName, model, ss?.deviceType, names.mdns);
    const type = inv?.type || (isGateway ? 'router' : isSelf ? 'pc' : guessed !== 'unknown' ? guessed : vendor?.type || 'unknown');

    const onlineSince = !online ? null : continuous && old.onlineSince && old.online ? old.onlineSince : nowIso;
    store[mac] = { ip, online, onlineSince, lastSeen, firstSeen: old.firstSeen || (online ? nowIso : null), names, model };
    devices.push({
      mac,
      ip,
      name: inv?.name || autoName || (isGateway ? 'Router' : null),
      type: TYPES.includes(type) ? type : 'unknown',
      link: inv?.link || (isSelf ? (/wi-?fi|wlan|wireless/i.test(ifaceName(iface)) ? 'wifi' : 'ethernet') : isGateway ? 'ethernet' : null),
      parent: parentRef(inv?.parent),
      known: Boolean(inv) || isSelf || isGateway,
      gateway: isGateway,
      self: isSelf,
      sleeps: Boolean(inv?.sleeps),
      randomMac: isRandomMac(mac),
      model: model || null,
      vendor: vendor?.vendor || null,
      online,
      onlineSince,
      lastSeen,
    });
  }
  return { result: { scannedAt: nowIso, subnet, gateway, devices }, store: { scannedAt: nowIso, devices: store } };
}

// El padre se indica con la MAC del equipo del que cuelga (repetidor, switch...) o con "router".
const parentRef = (p) => (!p ? null : /^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i.test(p) ? normMac(p) : String(p).toLowerCase());

function ifaceName(iface) {
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) if (addrs.some((a) => a.address === iface.address)) return name;
  return '';
}
