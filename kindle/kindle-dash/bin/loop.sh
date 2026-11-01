#!/bin/sh
. /mnt/us/extensions/kindle-dash/bin/lib.sh
echo $$ > "$PIDFILE"
log "inicio (cada ${INTERVAL_MIN} min)"

if [ "$STOP_FRAMEWORK" = "1" ]; then
  stop lab126_gui >/dev/null 2>&1 || /etc/init.d/framework stop >/dev/null 2>&1
  # Las apps abiertas (navegador, tienda...) sobreviven a la parada de la interfaz y se redibujan encima.
  for p in $(ps -eo pid,args | grep '[m]esquite' | awk '{print $1}'); do kill "$p"; done
  sleep 3
  # Sin interfaz no hay forma táctil de salir: deslizar hacia abajo desde arriba al centro llama a stop.sh.
  if [ -x "$LUAJIT" ]; then
    "$LUAJIT" "$DIR/bin/gesture.lua" "$TOUCH_DEV" >/dev/null 2>&1 &
    echo $! > "$GESTURE_PIDFILE"
  else
    log "sin LuaJIT en $LUAJIT: gesto de salida desactivado"
  fi
fi
lipc-set-prop com.lab126.powerd preventScreenSaver 1

n=0
while true; do
  if ! wifi_up; then
    lipc-set-prop com.lab126.wifid enable 1
    sleep 15
  fi
  if [ $((n % FULL_REFRESH_EVERY)) -eq 0 ]; then full=1; else full=0; fi
  draw "$full" && n=$((n + 1))
  sleep $((INTERVAL_MIN * 60))
done
