# Kindle

El Kindle ejecuta una extensión de **KUAL** (`kindle/kindle-dash`) que descarga la imagen del servidor cada pocos
minutos con `curl` y la pinta con `eips`. Necesitas un Kindle con jailbreak, KUAL, acceso por SSH como root y,
para los gestos y la pantalla de error, KOReader instalado (se usan su LuaJIT y FBInk).

## Instalación

1. Copia `kindle/kindle-dash/config.example.sh` como `config.sh` y pon en `DASH_URL` la URL de `dash.png` con la
   clave (`DASH_KEY`):

   ```sh
   DASH_URL="https://TU-APP.up.railway.app/dash.png?key=CAMBIA_ESTO"   # o http://<ip-del-pc>:3000/dash.png?key=...
   INTERVAL_MIN=5
   FULL_REFRESH_EVERY=6
   STOP_FRAMEWORK=1
   ```

   `config.sh` no se sube a git.
2. Copia la carpeta al Kindle:

   ```sh
   scp -r kindle/kindle-dash root@<ip-del-kindle>:/mnt/us/extensions/
   ```

3. En KUAL: **Kindle Dash → Iniciar dashboard**.

El log queda en `/tmp/kindle-dash.log`.

## Interfaz del Kindle

Con `STOP_FRAMEWORK=1`, la interfaz del Kindle se detiene mientras corre el dashboard (y se cierran las apps
abiertas, como el navegador): así no se redibuja encima ni salta el salvapantallas. Para volver al modo normal:

- **Desliza hacia abajo desde el borde superior, en el centro** (`bin/gesture.lua`).
- O por SSH: `ssh root@<ip-del-kindle> sh /mnt/us/extensions/kindle-dash/bin/stop.sh`.
- O reinicia manteniendo el botón de encendido unos 40 segundos.

`FULL_REFRESH_EVERY` hace un refresco completo (el parpadeo negro que borra el *ghosting*) cada N imágenes; las
demás son parciales.

## Varias pantallas

Desliza hacia la izquierda para ir a la siguiente pantalla y hacia la derecha para volver; las bolitas de la
cabecera indican en cuál estás. El Kindle pide `dash.png?page=N` y el servidor elige la pantalla de la lista
`PAGES` de `server/render/render.js`, dando la vuelta en los extremos. La primera muestra las métricas y la
segunda, la [red local](red-local.md).

## Detalle de una tarjeta

Tócala y se abre a pantalla completa, con más datos (la cabecera con hora, fecha y batería sigue visible). Para
volver, pulsa la X o desliza hacia arriba desde el borde inferior.

El Kindle no sabe dónde está cada tarjeta: envía el toque como `&tap=x,y` y el servidor lo resuelve con un mapa
de toques (cada zona pulsable se pinta con un gris propio en una pasada invisible) y devuelve la vista en la
cabecera `X-View`, que el Kindle guarda en `/tmp/kindle-dash.view` y manda como `&view=` en cada refresco. Las
vistas están en `server/render/details.js`.

## Sin conexión

Si la descarga falla, el Kindle muestra una pantalla completa con la causa (`000` sin conexión, `401` clave
incorrecta u otro código) y los pasos para arreglarlo. La URL del servidor sale de `DASH_URL` (o de `SERVER_URL`,
si la pones) y los pasos se adaptan: con una IP de la red de casa, arrancar el servidor en el PC; con un dominio,
comprobar `/health` y el servicio en Railway.
