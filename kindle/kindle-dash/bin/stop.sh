#!/bin/sh
. /mnt/us/extensions/kindle-dash/bin/lib.sh
[ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null
rm -f "$PIDFILE"
[ -f "$GESTURE_PIDFILE" ] && kill "$(cat "$GESTURE_PIDFILE")" 2>/dev/null
rm -f "$GESTURE_PIDFILE"
rmdir "$LOCK" 2>/dev/null
rm -f "$VIEW"
lipc-set-prop com.lab126.powerd preventScreenSaver 0
log "parado"
if [ "$STOP_FRAMEWORK" = "1" ]; then
  start lab126_gui >/dev/null 2>&1 || /etc/init.d/framework start >/dev/null 2>&1
else
  eips -c
fi
