# Servidor

El servidor (`server/index.js`) es un **servicio web** que tiene que estar siempre escuchando: sirve la imagen
al Kindle, resuelve sus toques, recibe los datos del agente del PC y sirve la web y el widget. Las fuentes en la
nube se recogen dentro del propio servidor, cada una con su intervalo (`GITHUB_EVERY_MIN`, `RAILWAY_EVERY_MIN`,
`GSC_EVERY_MIN`, `GCP_BILLING_EVERY_MIN`).

Todas las variables están en [`.env.example`](../.env.example). Para generar `INGEST_TOKEN`, `DASH_KEY` y
`WEB_KEY`:

```sh
node -e "console.log(crypto.randomBytes(24).toString('base64url'))"
```

| Variable | Para qué |
|---|---|
| `INGEST_TOKEN` | Lo envía el agente del PC en `POST /api/ingest` |
| `DASH_KEY` | Va en la URL del Kindle y del widget (`/dash.png?key=…`) |
| `WEB_KEY` | Clave de la página web `/web`; vacía, la web queda desactivada |
| `DATA_DIR` | Carpeta del `state.json` (en Railway, el volumen `/data`) |
| `TZ_DISPLAY` | Zona horaria de la hora y las fechas (por defecto `Europe/Madrid`) |
| `KINDLE_REFRESH_MIN` | Cada cuántos minutos se refrescan el Kindle y la web |

## En Railway

1. Sube el repositorio a GitHub y crea un servicio en Railway a partir de él (`railway.json` ya define el
   arranque y el healthcheck en `/health`; Railway pone `PORT`).
2. Añade un **volumen** montado en `/data` y la variable `DATA_DIR=/data`, para que el estado sobreviva a los
   despliegues.
3. Copia las variables de tu `.env` local a la pestaña **Variables** del servicio (`.env` no se sube a git).
   `GOOGLE_SERVICE_ACCOUNT_JSON` mejor en base64.
4. Genera un dominio público (**Settings → Networking → Generate Domain**) y comprueba
   `https://TU-APP.up.railway.app/health` y `https://TU-APP.up.railway.app/web`.
5. Apunta los clientes al dominio: en el Kindle, `DASH_URL` de `config.sh` (y reinicia el dashboard); en el PC,
   `SERVER_URL` de `agent\.env`.

**Memoria:** Railway cobra la RAM que se usa de verdad (GB-minuto), no el límite del servicio. Para gastar menos,
el servidor usa `sharp` sin caché y con un hilo (`server/render/render.js`) y Node arranca con
`--max-old-space-size=128` (`npm start`): se queda en unos 110 MB en reposo y no pasa de ~200 MB al dibujar. En
Linux ayuda además la variable `MALLOC_ARENA_MAX=2`.

## En el PC

Crea `.env` en la raíz con las mismas variables (`npm start` lo carga solo) y registra el arranque al iniciar
sesión:

```powershell
powershell -ExecutionPolicy Bypass -File server\install-task.ps1   # -Remove para quitarlo
```

El log queda en `data\server.log`. El Kindle apunta a `http://<ip-del-pc>:3000/dash.png?key=…`; abre el puerto
3000 en el cortafuegos de Windows, solo en el perfil **Privado**.

## Endpoints

| Ruta | Clave | Qué hace |
|---|---|---|
| `GET /dash.png?page=N&view=…&tap=x,y` | `DASH_KEY` | Imagen del Kindle; la vista resultante vuelve en la cabecera `X-View` |
| `GET /widget.png?w=700&theme=dark` | `DASH_KEY` | Widget con fondo transparente (ver [widget](widget.md)) |
| `GET /web` | `WEB_KEY` | Los dashboards en el navegador |
| `POST /api/ingest` | `INGEST_TOKEN` | Recibe `claude`, `immich`, `network` y `mcp` del agente |
| `POST /api/refresh` | `DASH_KEY` | Fuerza la recogida de las fuentes de la nube |
| `GET /api/state` | `DASH_KEY` | Devuelve el JSON guardado |
| `GET /health` | — | `{"ok":true}`, para el healthcheck |

`DASH_KEY` va como `?key=` en la URL, porque el `curl` del Kindle no siempre puede mandar cabeceras;
`INGEST_TOKEN`, como `Authorization: Bearer`.

## Página web

`/web` muestra los mismos dashboards en el navegador: clic en una tarjeta para el detalle, **←/→** o deslizar
para cambiar de pantalla, **Esc**, **Volver** o la X para cerrar el detalle. Se actualiza sola cada
`KINDLE_REFRESH_MIN` minutos.

Se entra con `WEB_KEY` en un formulario (la clave nunca va en la URL) y queda una cookie de sesión de 30 días,
`HttpOnly`, `SameSite=Strict` y `Secure` en HTTPS. La cookie es una firma de la clave: cambiar `WEB_KEY` cierra
todas las sesiones. La clave del Kindle (`DASH_KEY`) no abre la web.

## Diseño

`npm run preview` genera `out/preview.png` (y `out/preview-2.png`… para cada pantalla, `out/detail-*.png` para
cada detalle y `out/widget.png` con el widget sobre un degradado) con datos de ejemplo, y comprueba que un toque
en cada tarjeta abre su detalle. `npm run preview -- ruta/state.json` usa datos reales.

Las tarjetas están en `server/render/cards.js`, los detalles en `server/render/details.js` y la red local en
`server/render/network.js`. Las pantallas se eligen de la lista `PAGES` de `server/render/render.js`.
