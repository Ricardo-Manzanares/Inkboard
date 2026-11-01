#!/bin/sh
DIR=/mnt/us/extensions/kindle-dash
. "$DIR/config.sh"
PIDFILE=/tmp/kindle-dash.pid
GESTURE_PIDFILE=/tmp/kindle-dash-gesture.pid
LUAJIT=${LUAJIT:-/mnt/us/koreader/luajit}
TOUCH_DEV=${TOUCH_DEV:-/dev/input/event1}
IMG=/tmp/kindle-dash.png
LOG=/tmp/kindle-dash.log
LAST_OK=/tmp/kindle-dash.last-ok
OFFLINE=/tmp/kindle-dash.offline
PAGE=/tmp/kindle-dash.page
VIEW=/tmp/kindle-dash.view
LOCK=/tmp/kindle-dash.lock
FONTS=/mnt/us/koreader/fonts/noto

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

battery() {
  b=$(gasgauge-info -c 2>/dev/null | tr -dc '0-9')
  [ -z "$b" ] && b=$(lipc-get-prop com.lab126.powerd battLevel 2>/dev/null)
  echo "$b"
}

charging() {
  [ "$(lipc-get-prop com.lab126.powerd isCharging 2>/dev/null)" = "1" ] && echo 1 || echo 0
}

wifi_up() { lipc-get-prop com.lab126.wifid cmState 2>/dev/null | grep -q CONNECTED; }

fbink_bin() {
  for b in /mnt/us/koreader/fbink /mnt/us/libkh/bin/fbink /mnt/us/usbnet/bin/fbink; do
    [ -x "$b" ] && { echo "$b"; return; }
  done
}

# Descarga la imagen y escribe el código HTTP en stdout (000 = sin conexión). Las cabeceras quedan en $IMG.hdr.
# El OpenSSL del Kindle es antiguo y su lista de CAs también: -k evita fallos de certificado.
# Lo único que viaja es la imagen y la clave de solo lectura del dashboard.
fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -sk --max-time 40 -D "$IMG.hdr" -o "$2" -w '%{http_code}' "$1"
  elif wget -q -O "$2" "$1"; then
    echo 200
  else
    echo 000
  fi
}

# Panel de error a pantalla completa con la causa y cómo recuperarlo. Sin FBInk, una línea con eips.
offline_screen() {
  reason=$1
  now=$(date +%H:%M)
  # URL del servidor: SERVER_URL de config.sh si está, si no el esquema y dominio de DASH_URL.
  base=${SERVER_URL:-$(echo "$DASH_URL" | sed 's|^\([a-z]*://[^/?]*\).*|\1|')}
  base=${base%/}
  host=$(echo "$base" | sed 's|^[a-z]*://||; s|[:/].*||')
  # Con una IP de la red de casa el servidor es el PC; si no, uno desplegado (Railway).
  case "$host" in
    localhost|127.*|10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*) lan=1 ;;
    *) lan=0 ;;
  esac
  last=$(cat "$LAST_OK" 2>/dev/null)
  fb=$(fbink_bin)
  if [ -z "$fb" ]; then
    eips 2 1 "DASHBOARD $now - $reason" >/dev/null
    return
  fi
  if [ ! -f "$FONTS/NotoSans-Regular.ttf" ]; then
    # Sin TTF: fuente interna de FBInk, centrada, ampliada y sin caja blanca detrás.
    "$fb" -q -O -m -S 3 -y 2 "DASHBOARD - $now" "$reason" >/dev/null 2>&1
    return
  fi
  font="regular=$FONTS/NotoSans-Regular.ttf,bold=$FONTS/NotoSans-Bold.ttf"
  line() { # $1 = y, $2 = px, $3 = texto (admite **negrita**), $4 = -m para centrar
    "$fb" -q -b -O $4 -t "$font,px=$2,top=$1,left=70,right=70,format" "$3" >/dev/null 2>&1
  }
  "$fb" -q -b -k >/dev/null 2>&1
  "$fb" -q -b -k top=0,left=0,width=1072,height=16 -B BLACK >/dev/null 2>&1
  "$fb" -q -b -k top=1432,left=0,width=1072,height=16 -B BLACK >/dev/null 2>&1
  line 100 100 "**DASHBOARD - $now**" -m
  # La causa puede ocupar dos líneas a este tamaño: el resto empieza debajo.
  line 230 64 "**$reason**" -m
  line 420 36 "Servidor: $base"
  line 475 36 "Último dato correcto: ${last:-ninguno} · reintento cada ${INTERVAL_MIN} min"
  "$fb" -q -b -k top=560,left=70,width=932,height=5 -B BLACK >/dev/null 2>&1
  line 620 48 "**Cómo recuperarlo**"
  if [ "$lan" = "1" ]; then
    line 720 38 "**1.** Enciende el PC y arranca el servidor:"
    line 775 38 "     cd <carpeta de Inkboard>"
    line 830 38 "     npm start"
  else
    line 720 38 "**1.** Comprueba en el navegador que el servidor responde:"
    line 775 34 "     $base/health"
    line 830 38 "     Si no responde, revisa el servicio en Railway."
  fi
  line 930 38 "**2.** Espera: el Kindle reintenta solo cada ${INTERVAL_MIN} min."
  line 1030 38 "**3.** Si sigue igual, reinicia el dashboard:"
  line 1085 38 "     desliza hacia abajo desde arriba, en el centro,"
  line 1140 38 "     y abre KUAL > Kindle Dash > Iniciar dashboard."
  line 1340 32 "Batería $(battery) % · Wi-Fi $(wifi_up && echo conectado || echo desconectado)"
  "$fb" -q -s -f >/dev/null 2>&1
}

# Pantalla actual. gesture.lua la suma o resta al deslizar y el servidor da la vuelta en los extremos.
page() { cat "$PAGE" 2>/dev/null || echo 0; }

# Tarjeta abierta en detalle (vacío = cuadrícula). La decide el servidor y llega en la cabecera X-View.
view() { cat "$VIEW" 2>/dev/null; }

# El bucle y los gestos pintan por separado: uno espera al otro para no mezclar descargas.
# Si el cerrojo dura más de 60 s, es de un proceso muerto y se recupera.
draw() {
  i=0
  while ! mkdir "$LOCK" 2>/dev/null; do
    i=$((i + 1))
    [ $i -ge 60 ] && rmdir "$LOCK" 2>/dev/null
    sleep 1
  done
  draw_now "$1"
  rc=$?
  rmdir "$LOCK" 2>/dev/null
  return $rc
}

# $1 = 1 para refresco completo. Con TAP="x,y" el servidor resuelve el toque y puede cambiar de vista.
draw_now() {
  url="$DASH_URL&battery=$(battery)&charging=$(charging)&page=$(page)&view=$(view)${TAP:+&tap=$TAP}"
  rm -f "$IMG.hdr"
  code=$(fetch "$url" "$IMG.tmp")
  if [ "$code" = "200" ] && [ -s "$IMG.tmp" ]; then
    mv "$IMG.tmp" "$IMG"
    v=$(sed -n 's/^[Xx]-[Vv]iew: *\([a-z]*\).*/\1/p' "$IMG.hdr" 2>/dev/null)
    case "$v" in
      grid) rm -f "$VIEW" ;;
      ?*) echo "$v" > "$VIEW" ;;
    esac
    # Tras el panel de error, refresco completo para no dejar restos.
    full=$1
    [ -f "$OFFLINE" ] && full=1 && rm -f "$OFFLINE"
    if [ "$full" = "1" ]; then eips -c; eips -f -g "$IMG"; else eips -g "$IMG"; fi
    date +%H:%M > "$LAST_OK"
    return 0
  fi
  rm -f "$IMG.tmp"
  case "$code" in
    000) reason="Sin conexión con el servidor" ;;
    401) reason="Clave del dashboard no válida (401)" ;;
    *) reason="El servidor respondió con error $code" ;;
  esac
  log "fallo ($code) al descargar $DASH_URL"
  touch "$OFFLINE"
  offline_screen "$reason"
  return 1
}
