# Copia este archivo como config.sh, edítalo y sube la carpeta a /mnt/us/extensions/kindle-dash/
DASH_URL="https://TU-APP.up.railway.app/dash.png?key=CAMBIA_ESTO"
# Opcional: URL del servidor que sale en la pantalla de "sin conexión". Vacía = la de DASH_URL
SERVER_URL=
INTERVAL_MIN=5
# Refresco completo (parpadeo negro que borra el ghosting) cada N imágenes. Las demás son parciales.
FULL_REFRESH_EVERY=6
# 1 = para la interfaz del Kindle mientras corre el dashboard: no se redibuja encima ni salta el salvapantallas.
# Para volver al Kindle normal: desliza hacia abajo desde el borde superior, en el centro (necesita KOReader por su LuaJIT),
# o por SSH: sh /mnt/us/extensions/kindle-dash/bin/stop.sh
STOP_FRAMEWORK=1
