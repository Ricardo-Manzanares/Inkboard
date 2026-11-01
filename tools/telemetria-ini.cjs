// Genera la piel de telemetría del PC (Rainmeter/Telemetria/Telemetry.ini) con las mismas medidas que las tarjetas de
// Inkboard: diseño a 1072 px de ancho, escalado por #S#.
// Uso: node tools/telemetria-ini.cjs [ruta de salida]
const fs = require('fs');
const out = process.argv[2] || require('path').join(__dirname, '..', 'Rainmeter', 'Telemetria', 'Telemetry.ini');
const MAX_DISKS = 6;

const s = (n) => `(${n}*#S#)`;
const pt = (px) => `(${px}*#Pt#)`; // Rainmeter mide las fuentes en puntos: px * 0.75 * escala

const lines = [];
const add = (...l) => lines.push(...l, '');

// Texto con el estilo de las tarjetas: Inter, color y peso dados.
function textMeter(name, { x, y, px, weight = 400, color = '#Ink#', align = 'Left', text = '', extra = [] }) {
  add(
    `[${name}]`,
    'Meter=String',
    'MeterStyle=sText',
    `X=${s(x)}`,
    `Y=${s(y)}`,
    `FontSize=${pt(px)}`,
    `FontWeight=${weight}`,
    `FontColor=${color}`,
    `StringAlign=${align}`,
    ...(text ? [`Text=${text}`] : []),
    ...extra,
  );
}

function card(name, y, h, extra = []) {
  add(`[${name}]`, 'Meter=Shape', `X=${s(22)}`, `Y=${s(y)}`, `Shape=Rectangle 0,0,${s(1028)},${h},${s(26)} | Fill Color #Card# | StrokeWidth 0`, ...extra);
}

// Cabecera de tarjeta: insignia, título, subtítulo y la etiqueta redonda de la derecha.
function cardHeader(prefix, y, icon, title, extra = []) {
  add(`[${prefix}Badge]`, 'Meter=Image', `ImageName=#@#Images\\${icon}-#Theme#.png`, `X=${s(46)}`, `Y=${s(y + 16)}`, `W=${s(48)}`, `H=${s(48)}`, ...extra);
  textMeter(`${prefix}Title`, { x: 110, y: y + 13, px: 28, weight: 700, text: title, extra });
  textMeter(`${prefix}Subtitle`, { x: 110, y: y + 48, px: 19, color: '#Dim#', extra });
  add(
    `[${prefix}Chip]`,
    'Meter=Shape',
    `X=${s(906)}`,
    `Y=${s(y + 22)}`,
    `Shape=Rectangle ${s(1)},${s(1)},${s(118)},${s(38)},${s(19)} | Fill Color #Card# | StrokeWidth ${s(2)} | Stroke Color #Ink#`,
    ...extra,
  );
  textMeter(`${prefix}ChipText`, { x: 966, y: y + 28, px: 20, weight: 600, align: 'Center', text: 'en vivo', extra });
}

// Barra como la del Kindle: pista gris con borde de tinta y relleno de tinta según el porcentaje.
// El relleno es una píldora de ancho mínimo su alto (con valores bajos, un extremo redondeado);
// al 0 % no se dibuja, y el alto 0,01 evita que Rainmeter descarte la forma.
function barMeter(name, { x, y, w, h, measure, extra = [] }) {
  const pct = `Clamp([${measure}],0,100)`;
  add(
    `[${name}]`,
    'Meter=Shape',
    `X=${s(x)}`,
    `Y=${s(y)}`,
    `Shape=Rectangle 0,0,${s(w)},${s(h)},${s(h / 2)} | Fill Color #Track# | StrokeWidth ${s(2)} | Stroke Color #Ink#`,
    `Shape2=Rectangle 0,0,((${pct} > 0 ? Max(${h}, ${w}*${pct}/100) : 0.01)*#S#),${s(h)},${s(h / 2)} | Fill Color #Ink# | StrokeWidth 0`,
    'DynamicVariables=1',
    ...extra,
  );
}

add(
  '; Telemetry e-ink: CPU, RAM, SWAP y discos del PC con el diseño del Kindle Dashboard (tema oscuro).',
  '; Generado; la configuración está en @Resources\\Variables.inc y los discos en @Resources\\Disks.inc (install.ps1).',
  '',
  '[Rainmeter]',
  'Update=1000',
  'AccurateText=1',
  'DynamicWindowSize=1',
  'OnRefreshAction=[!ZPos "-2"][!Draggable "0"][!KeepOnScreen "0"][!SnapEdges "0"]',
  'ContextTitle=Administrador de tareas',
  'ContextAction=["taskmgr.exe"]',
  'ContextTitle2=Explorador de archivos',
  'ContextAction2=["explorer.exe" "shell:MyComputerFolder"]',
);
add('[Metadata]', 'Name=Inkboard Telemetría', 'Author=Ricardo Manzanares', 'Information=CPU, RAM, SWAP y discos con el diseño de las tarjetas de Inkboard.', 'Version=1.0', 'License=MIT');
add(
  '[Variables]',
  '; Texto bajo «Sistema». Vacío = nombre del equipo y procesador; Variables.inc puede cambiarlo.',
  'SystemSubtitle=',
  '; Desplazamiento horizontal desde el borde, para poner varios widgets en fila.',
  'OffsetX=0',
  '@Include=#@#Variables.inc',
  '@Include2=#@#Disks.inc',
  '; Escala: el diseño se dibuja a 1072 px de ancho, como el dashboard.',
  'S=(#Width#/1072)',
  'Pt=(0.75*#Width#/1072)',
  '; Colores del tema elegido en Variables.inc (Theme=dark o light): Card, Ink, Dim, Track, Area.',
  '@Include3=#@#Themes\\#Theme#.inc',
  'Host=%COMPUTERNAME%',
  'Threads=%NUMBER_OF_PROCESSORS%',
);
add('[sText]', 'FontFace=Inter', 'AntiAlias=1', 'ClipString=0');

// --- Posición: esquina superior del monitor elegido, a la izquierda (Align=0) o a la derecha (Align=1) ---
add(
  '[MeasureX]',
  'Measure=Calc',
  'Formula=[#Align] * ([#WORKAREAX@[#Monitor]] + [#WORKAREAWIDTH@[#Monitor]] - [#Width] - [#Margin] - [#OffsetX]) + (1 - [#Align]) * ([#WORKAREAX@[#Monitor]] + [#Margin] + [#OffsetX])',
  'DynamicVariables=1',
  'UpdateDivider=-1',
);
add('[MeasureY]', 'Measure=Calc', 'Formula=[#WORKAREAY@[#Monitor]] + [#Margin]', 'DynamicVariables=1', 'UpdateDivider=-1');
add('[MeasurePlace]', 'Measure=Calc', 'Formula=1', 'UpdateDivider=-1', 'OnUpdateAction=[!Move "[MeasureX]" "[MeasureY]"]');

// --- Medidas del sistema ---
add('[MeasureCPU]', 'Measure=CPU', 'MinValue=0', 'MaxValue=100');
add('[MeasureRAMUsed]', 'Measure=PhysicalMemory');
add('[MeasureRAMTotal]', 'Measure=PhysicalMemory', 'Total=1', 'UpdateDivider=60');
add('[MeasureRAMPct]', 'Measure=Calc', 'Formula=MeasureRAMTotal > 0 ? MeasureRAMUsed / MeasureRAMTotal * 100 : 0', 'MinValue=0', 'MaxValue=100');
add(
  '; SWAP en Windows = archivo de paginación: el porcentaje en uso del contador de rendimiento.',
  '[MeasureSwapPct]',
  'Measure=Plugin',
  'Plugin=UsageMonitor',
  'Category=Paging File',
  'Counter=% Usage',
  'Name=_Total',
  'MinValue=0',
  'MaxValue=100',
);
add(
  '; Tamaño del archivo de paginación en MB; cambia poco, se lee al cargar y cada 10 min.',
  '[MeasureSwapSize]',
  'Measure=Plugin',
  'Plugin=RunCommand',
  'Program=powershell.exe',
  'Parameter=-NoProfile -NonInteractive -Command "(Get-CimInstance Win32_PageFileUsage | Measure-Object AllocatedBaseSize -Sum).Sum"',
  'State=Hide',
  'OutputType=ANSI',
  'UpdateDivider=600',
  'OnUpdateAction=[!CommandMeasure MeasureSwapSize "Run"]',
);
add('[MeasureProcesses]', 'Measure=Plugin', 'Plugin=PerfMon', 'PerfMonObject=System', 'PerfMonCounter=Processes', 'PerfMonInstance=', 'PerfMonDifference=0', 'UpdateDivider=5');
add('[MeasureUptime]', 'Measure=Uptime', 'Format="%4!i! d %3!i! h %2!i! min"', 'UpdateDivider=30');
add(
  '[MeasureCPUName]',
  'Measure=Registry',
  'RegHKey=HKEY_LOCAL_MACHINE',
  'RegKey=HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0',
  'RegValue=ProcessorNameString',
  'UpdateDivider=-1',
);
for (let i = 1; i <= MAX_DISKS; i++) {
  const off = `Disabled=(${i} > #DiskCount#)`;
  add(`[MeasureDisk${i}Free]`, 'Measure=FreeDiskSpace', `Drive=#Disk${i}#`, 'IgnoreRemovable=0', 'UpdateDivider=30', off);
  add(`[MeasureDisk${i}Total]`, 'Measure=FreeDiskSpace', `Drive=#Disk${i}#`, 'Total=1', 'IgnoreRemovable=0', 'UpdateDivider=30', off);
  add(`[MeasureDisk${i}Label]`, 'Measure=FreeDiskSpace', `Drive=#Disk${i}#`, 'Label=1', 'IgnoreRemovable=0', 'UpdateDivider=300', off);
  add(
    `[MeasureDisk${i}Pct]`,
    'Measure=Calc',
    `Formula=MeasureDisk${i}Total > 0 ? (MeasureDisk${i}Total - MeasureDisk${i}Free) / MeasureDisk${i}Total * 100 : 0`,
    'MinValue=0',
    'MaxValue=100',
    off,
  );
}
add('; Textos con formato español (coma decimal, GB/TB); el script los coloca en los medidores.', '[MeasureScript]', 'Measure=Script', 'ScriptFile=#@#Telemetry.lua', 'MaxDisks=' + MAX_DISKS);

// --- Tarjeta Sistema (y = 6, alto 380) ---
card('MeterSystemCard', 6, s(380));
cardHeader('MeterSystem', 6, 'system', 'Sistema');
[
  ['CPU', 'CPU', 'MeasureCPU'],
  ['RAM', 'Memoria RAM', 'MeasureRAMPct'],
  ['Swap', 'SWAP (archivo de paginación)', 'MeasureSwapPct'],
].forEach(([key, label, measure], i) => {
  const y = 82 + i * 100;
  textMeter(`Meter${key}Label`, { x: 46, y, px: 22, weight: 500, color: '#Dim#', text: label });
  textMeter(`Meter${key}Value`, { x: 466, y: y - 8, px: 34, weight: 800, align: 'Right' });
  barMeter(`Meter${key}Bar`, { x: 46, y: y + 36, w: 420, h: 18, measure });
  textMeter(`Meter${key}Sub`, { x: 46, y: y + 60, px: 19, color: '#Dim#' });
});
textMeter('MeterHistoryLabel', { x: 502, y: 82, px: 19, color: '#Dim#', text: 'CPU en tiempo real' });
textMeter('MeterHistoryMax', { x: 1026, y: 82, px: 19, color: '#Dim#', align: 'Right' });
add('[MeterHistoryArea]', 'Meter=Histogram', 'MeasureName=MeasureCPU', `X=${s(502)}`, `Y=${s(110)}`, `W=${s(524)}`, `H=${s(170)}`, 'PrimaryColor=#Area#', 'AutoScale=0', 'AntiAlias=1');
add('[MeterHistoryLine]', 'Meter=Line', 'MeasureName=MeasureCPU', `X=${s(502)}`, `Y=${s(110)}`, `W=${s(524)}`, `H=${s(170)}`, 'LineCount=1', 'LineColor=#Ink#', `LineWidth=${s(3)}`, 'AutoScale=0', 'AntiAlias=1');
textMeter('MeterUptimeLabel', { x: 502, y: 298, px: 19, weight: 500, color: '#Dim#', text: 'Encendido' });
textMeter('MeterUptimeValue', { x: 502, y: 320, px: 30, weight: 700 });
textMeter('MeterProcessesLabel', { x: 780, y: 298, px: 19, weight: 500, color: '#Dim#', text: 'Procesos' });
textMeter('MeterProcessesValue', { x: 780, y: 320, px: 30, weight: 700 });

// --- Tarjeta Discos (y = 398; alto según #DiskCount#) ---
const DISKS_Y = 398;
card('MeterDisksCard', DISKS_Y, `((76+#DiskCount#*74+10)*#S#)`);
cardHeader('MeterDisks', DISKS_Y, 'disks', 'Discos');
for (let i = 1; i <= MAX_DISKS; i++) {
  const y = DISKS_Y + 76 + (i - 1) * 74;
  const hide = [`Hidden=(${i} > #DiskCount#)`];
  textMeter(`MeterDisk${i}Letter`, { x: 46, y: y - 2, px: 26, weight: 800, text: `#Disk${i}#`, extra: hide });
  textMeter(`MeterDisk${i}Label`, { x: 96, y: y + 4, px: 19, color: '#Dim#', extra: hide });
  textMeter(`MeterDisk${i}Value`, { x: 1026, y: y + 1, px: 22, weight: 600, align: 'Right', extra: hide });
  barMeter(`MeterDisk${i}Bar`, { x: 46, y: y + 38, w: 980, h: 16, measure: `MeasureDisk${i}Pct`, extra: hide });
}
// Margen inferior transparente para que el tamaño de la ventana incluya la sombra de la última tarjeta.
add('[MeterBottom]', 'Meter=Image', `X=0`, `Y=((${DISKS_Y}+76+#DiskCount#*74+16)*#S#)`, 'W=1', 'H=1', 'SolidColor=0,0,0,1');

fs.writeFileSync(out, '﻿' + lines.join('\r\n'), 'utf16le');
console.log(`${out}: ${lines.length} líneas`);
