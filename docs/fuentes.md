# Fuentes de datos

El servidor recoge estas fuentes por su cuenta; cada una se activa al rellenar sus variables y escribe
`[nombre] ok` en el log cuando funciona. Claude Code, Immich y la red local las envía el
[agente del PC](agente.md).

## GitHub

La tarjeta muestra tus contribuciones de las últimas 30 semanas (como el calendario del perfil) y los commits por
mes y repositorio de los últimos 3 meses.

1. En [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) crea un
   token **fine-grained**: propietario tu usuario, **All repositories** y permiso de repositorio
   **Contents: Read-only** (Metadata se añade solo).
2. Ponlo en `GITHUB_TOKEN` y reinicia el servidor; en el log debe salir `[github] ok`.

El calendario sale de GraphQL y los commits por repositorio de la API REST, que con un token fine-grained es la
única que incluye los repositorios privados. Si el calendario no cuenta los privados, activa
**Include private contributions on my profile** en tu perfil.

## Search Console

La tarjeta lee la API con una **cuenta de servicio** de Google Cloud; la clave no está en Search Console.

1. En [Google Cloud Console](https://console.cloud.google.com), crea o elige un proyecto y habilita
   **Google Search Console API** (APIs y servicios → Biblioteca).
2. **IAM y administración → Cuentas de servicio → Crear cuenta de servicio**, sin roles.
3. En la cuenta: **Claves → Agregar clave → Crear clave nueva → JSON**. Se descarga el `.json`; anota su
   `client_email`.
4. En [Search Console](https://search.google.com/search-console), en la propiedad:
   **Configuración → Usuarios y permisos → Añadir usuario** con ese `client_email` y permiso **Restringido**.
   Hay que ser propietario de la propiedad.
5. En `.env` (o en las variables de Railway):
   - `GSC_SITE_URL=sc-domain:midominio.com` para propiedades de dominio, o `https://midominio.com/` (con barra
     final) para prefijo de URL.
   - `GOOGLE_SERVICE_ACCOUNT_JSON=` con el JSON tal cual o en base64, que evita problemas con los saltos de
     línea: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("clave.json")) | Set-Clipboard`
6. Reinicia el servidor y busca `[gsc] ok` en el log. Después borra el `.json` descargado y no lo subas a git.

Si el log dice `User does not have sufficient permission for site`, la clave es válida pero falta el paso 4 o
`GSC_SITE_URL` no coincide con el tipo de propiedad. Se actualiza cada 6 h (`GSC_EVERY_MIN=360`) y los datos van
unos 2 días por detrás.

## Gasto de Google Cloud

La API de Cloud Billing no da el gasto, así que se lee de la **exportación de facturación a BigQuery**. Vale la
misma cuenta de servicio de Search Console; solo necesita permisos de BigQuery.

1. Crea el dataset en [BigQuery Studio](https://console.cloud.google.com/bigquery) de un proyecto **con
   facturación activa**: tres puntos junto al proyecto → **Crear conjunto de datos**, ID `billing_export`,
   multirregión **UE**, sin caducidad de tablas. El formulario de exportación no lo crea: solo deja elegir uno
   existente.
2. En [Facturación](https://console.cloud.google.com/billing) → **Exportación de la facturación** →
   **Costo de uso estándar** → **Editar configuración**: elige ese proyecto y el dataset `billing_export`. Hace
   falta ser administrador de la cuenta de facturación. La tabla `gcp_billing_export_v1_…` aparece con el primer
   lote de datos, a las pocas horas, y solo con el gasto desde que se activa.
3. En **IAM** del proyecto del dataset, **Otorgar acceso** al `client_email` de la cuenta de servicio (aunque sea
   de otro proyecto) con los roles **Usuario de trabajos de BigQuery** (`roles/bigquery.jobUser`) y
   **Visualizador de datos de BigQuery** (`roles/bigquery.dataViewer`).
4. En `.env`:
   - `GCP_BILLING_TABLE=mi-proyecto.billing_export`: basta el dataset, la tabla se busca sola.
   - `GCP_BILLING_PROJECT_IDS=mi-proyecto,mi-proyecto-dev`: IDs de proyecto (no nombres visibles) separados por
     comas. La exportación solo incluye los proyectos de **esa** cuenta de facturación; un proyecto de otra
     cuenta necesita su propia exportación.
   - `GCP_BILLING_LOCATION=` solo si el dataset no está en US ni EU.
5. Reinicia el servidor y busca `[billing] ok` en el log. Mientras no exista la tabla, el log y la tarjeta dicen
   que la exportación aún no la ha creado. Se actualiza cada 3 h (`GCP_BILLING_EVERY_MIN=180`).

La tarjeta muestra lo que se paga este mes (coste bruto menos descuentos, que incluyen el nivel gratuito), el
bruto y los descuentos, el mes anterior, el gasto por día y el de cada proyecto. El detalle añade la previsión
del mes, los servicios que más cuestan y el uso de **Firebase** (Realtime Database, Functions y Hosting) del
proyecto `GCP_BILLING_FIREBASE_PROJECT` (vacío = el primero de la lista) frente al nivel gratuito, calculado con
el uso por SKU de la propia exportación.

Al activar la exportación, Google rellena el historial hacia atrás por tandas (desde el mes anterior): hasta que
llega al mes en curso, la tarjeta puede mostrar 0 €. Las consultas entran de sobra en la capa gratuita de
BigQuery.

## Railway

La tarjeta muestra el gasto del mes, la estimación a final de mes, el reparto por CPU, RAM, red y disco, y el
estado de cada servicio.

1. Crea un token en [railway.com/account/tokens](https://railway.com/account/tokens), de cuenta o de workspace.
2. En `.env`: `RAILWAY_API_TOKEN`, `RAILWAY_WORKSPACE_ID` y, si quieres limitar los proyectos,
   `RAILWAY_PROJECT_IDS` separados por comas (vacío = todos los que ve el token).
3. Los precios por unidad están en `server/config.js` (`RAILWAY_PRICE_*`); revísalos con
   [railway.com/pricing](https://railway.com/pricing).
