# Agente del PC

`agent/agent.mjs` recoge lo que solo existe en el PC y lo envía al servidor por `POST /api/ingest`. Lo lanza
una tarea programada cada 5 minutos mientras el PC está encendido. No tiene dependencias: basta Node.js 22.

```powershell
copy agent\.env.example agent\.env           # rellena SERVER_URL, INGEST_TOKEN e IMMICH_API_KEY
copy agent\devices.example.json agent\devices.json   # opcional: inventario de la red local
node agent\agent.mjs --dry-run               # muestra lo que enviaría, sin enviarlo
powershell -ExecutionPolicy Bypass -File agent\install-task.ps1
```

`agent\.env`, `agent\devices.json`, `agent\state.json` y el log no se suben a git.

## Claude Code

- **Límites** (5 h y 7 d): se leen del endpoint interno que usa `/usage`, con el token OAuth de
  `~/.claude/.credentials.json`. El token solo se lee en el PC; al servidor llegan únicamente los porcentajes y
  la hora de reinicio. El endpoint no está documentado y puede cambiar; si falla, se reenvía la última lectura.
  Si el token ha caducado, basta con abrir Claude Code: el agente no lo renueva para no cerrar la sesión.
- **Tokens**: se calculan con los logs locales `~/.claude/projects/**/*.jsonl` e incluyen la caché (por eso
  salen cifras de millones).

## Immich

`IMMICH_URL` (por defecto `http://localhost:2283`) y una clave de **Ajustes de cuenta → Claves API** con
permisos `server.statistics`, `asset.statistics` y `queue.read` (o `job.read`). Si Immich no responde, el
dashboard lo marca como APAGADO y conserva la última lectura.

## Red local

Cada pasada barre la subred del PC y envía la lista de equipos (MAC, IP, nombre, tipo, conexión, desde cuándo
están en línea y cuándo se vieron por última vez). Tarda unos 15 segundos. Todo el detalle, en
[red-local.md](red-local.md).

| Variable | Por defecto | Para qué |
|---|---|---|
| `NET_SCAN` | `1` | `0` desactiva el barrido |
| `NET_FORGET_DAYS` | `7` | Días que se siguen mostrando los equipos sin identificar que ya no aparecen |

## Tarea programada

`agent\install-task.ps1` registra la tarea **KindleDashAgent**, que ejecuta el agente cada 5 minutos sin
ventana. El log queda en `agent\agent.log` (rota a `agent.log.1` al pasar de 500 KB). Para quitarla, borra la
tarea desde el Programador de tareas o con `Unregister-ScheduledTask KindleDashAgent`.
