#!/bin/sh
. /mnt/us/extensions/kindle-dash/bin/lib.sh
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  eips 30 1 "dashboard ya activo   " >/dev/null
  exit 0
fi
# setsid saca el bucle de la sesión de KUAL: al parar la interfaz, KUAL muere y se llevaría el bucle con él.
setsid sh "$DIR/bin/loop.sh" </dev/null >/dev/null 2>&1 &
