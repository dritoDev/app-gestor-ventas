# Mercato · gestor de ventas

Monorepo TypeScript para gestionar el catálogo, las ventas y el almacén de un ecommerce desde un panel interno. No incluye tienda pública ni checkout.

## Requisitos

- Node.js 20 o superior, Corepack y Docker con Docker Compose.
- Los puertos 3001 (panel), 4000 (API) y 5433 (PostgreSQL) disponibles (o ajustar la configuración).

## Puesta en marcha

```bash
cp .env.example .env
# Edita .env: cambia JWT_SECRET y usa una ADMIN_PASSWORD de al menos 12 caracteres.
docker compose up -d
corepack pnpm install
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev
```

Abre **http://localhost:3001**. Inicia sesión con `ADMIN_EMAIL` y `ADMIN_PASSWORD` configurados en `.env`. El seed crea el administrador y seis productos de ejemplo; puede repetirse sin duplicar registros. Las contraseñas se almacenan con scrypt y sal aleatoria, nunca en texto plano. El seed **no modifica** la contraseña de un usuario ya existente: si cambias `ADMIN_PASSWORD` después del primer seed, tendrás que actualizar ese usuario por separado.

## Comandos

| Comando | Función |
| --- | --- |
| `corepack pnpm dev` | Inicia Next.js (3001) y Express (4000) |
| `corepack pnpm typecheck` | Comprueba los tipos de todos los paquetes |
| `corepack pnpm test` | Ejecuta pruebas de lógica y validación |
| `corepack pnpm build` | Compila/verifica todos los paquetes |
| `corepack pnpm db:generate` | Genera una nueva migración al cambiar el esquema |
| `corepack pnpm db:migrate` | Aplica las migraciones SQL versionadas |
| `corepack pnpm db:seed` | Crea el administrador y productos de muestra |

## Estructura

- `apps/web`: panel Next.js (App Router), con resumen, catálogo, ventas y almacén.
- `apps/api`: API REST Express; acceso por cookie HTTP-only firmada, validación, operaciones transaccionales.
- `packages/db`: esquema PostgreSQL, migraciones Drizzle y datos de ejemplo.
- `packages/shared`: contratos Zod, tipos y utilidades monetarias compartidas.

Next.js hace proxy de `/api/*` hacia Express mediante `API_INTERNAL_URL` (por defecto `http://localhost:4000`). Así, desde el navegador, el panel y la API usan el mismo origen. Si usas otro dominio para el panel, configura `WEB_ORIGIN` en `.env` (separado por comas si necesitas varios). En producción utiliza HTTPS, un `JWT_SECRET` aleatorio y contraseñas fuertes. Las cookies se marcan `secure` cuando `NODE_ENV=production`.

## Reglas de negocio

- Los precios y totales se almacenan como enteros en céntimos de euro.
- Una venta crea líneas con una copia del nombre, SKU y precio; descuenta stock y registra movimientos dentro de **una sola transacción**. Los productos se bloquean para impedir sobreventa por peticiones simultáneas.
- Cancelar una venta devuelve el stock una sola vez y registra los movimientos inversos. Las ventas canceladas no cuentan para los indicadores de ingresos.
- El administrador puede editar productos, ajustar inventario y cancelar ventas. Los operadores pueden consultar el panel y registrar ventas. La versión inicial crea únicamente un administrador; no incluye gestión de usuarios desde la interfaz.
- El historial se limita a los 200 movimientos/ventas más recientes y el catálogo a 500 productos. Para catálogos mayores, añadir paginación en la API y en las tablas.

## Documentación interactiva de la API

Con `corepack pnpm dev` en marcha, abre **http://localhost:4000/api-docs/** para ver Swagger UI. El documento OpenAPI 3.0 está disponible en **http://localhost:4000/openapi.json** (también se puede importar en Postman/Insomnia).

Para probar rutas protegidas en Swagger UI, ejecuta primero **POST `/auth/login`** en «Try it out» con las credenciales configuradas en `.env`. El navegador guardará la cookie HTTP-only y la enviará en las siguientes operaciones: no necesitas pegar ningún token en «Authorize». Abre la documentación en el puerto **4000** (no mediante el proxy del panel), pues así las escrituras usan el mismo origen que la API. Los precios se indican en céntimos y las acciones exclusivas del administrador están señaladas en cada operación.

## API principal

`POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `GET/POST /products`, `PATCH /products/:id`, `POST /products/:id/stock`, `GET /inventory`, `GET/POST /sales`, `POST /sales/:id/cancel`, `GET /dashboard`, `GET /health`.

Todos los endpoints excepto login, logout, health y documentación requieren autenticación (logout limpia la cookie). Las peticiones de escritura originadas desde un navegador deben proceder de `WEB_ORIGIN` o del mismo origen de la API (para Swagger UI).

## MCP · Streamable HTTP y OAuth 2.1

La API incluye un servidor MCP TypeScript con el SDK oficial en **`/mcp`**. Las herramientas consumen la API REST por HTTP, manteniendo las validaciones, transacciones y permisos de administrador/operador.

### Configuración

El servidor actúa como **recurso protegido OAuth**. El repositorio incluye un **Keycloak local** listo para desarrollo: el realm `mercato` se importa desde `keycloak/mercato-realm.json` con los scopes, el cliente MCP y el mapeo al usuario de la base de datos ya configurados.

```bash
docker compose up -d keycloak   # consola: http://localhost:8081 (admin / admin)
```

| Elemento | Valor |
| --- | --- |
| Issuer / JWKS | `http://localhost:8081/realms/mercato` · `…/protocol/openid-connect/certs` |
| Cliente MCP (Authorization Code + PKCE S256) | `mercato-mcp` (público, sin secreto) |
| Cliente de pruebas (password grant) | `mercato-cli` (solo desarrollo) |
| Scopes | `mcp:read` y `mcp:write` (incluidos por defecto en el token) |
| Claim de usuario | `mercato_user_id` = UUID de `users.id` |
| Usuario | `admin` / `miclavesegura2026` (coincide con `ADMIN_PASSWORD`) |
| Callback permitido | `http://localhost:6274/oauth/callback` (MCP Inspector) |

Variables correspondientes en `.env`:

```dotenv
MCP_PUBLIC_URL=http://localhost:4000/mcp
MCP_OAUTH_ISSUER=http://localhost:8081/realms/mercato
MCP_OAUTH_JWKS_URL=http://localhost:8081/realms/mercato/protocol/openid-connect/certs
MCP_USER_ID_CLAIM=mercato_user_id
MCP_REST_URL=http://127.0.0.1:4000
MCP_ALLOWED_ORIGINS=http://localhost:6274
```

- `MCP_PUBLIC_URL`: URL pública exacta del recurso y audiencia (`aud`) de los access tokens. HTTPS fuera de localhost. El proxy inverso debe preservar ese `Host` y servir `/mcp` y `/.well-known/oauth-protected-resource*`.
- `MCP_OAUTH_ISSUER` y `MCP_OAUTH_JWKS_URL`: emisor exacto (`iss`) y URL de sus claves públicas. Se aceptan access tokens JWT firmados con RS256, PS256 o ES256, con `sub`, `iat` y `exp` obligatorios.
- `MCP_USER_ID_CLAIM`: claim firmado que contiene el UUID de un usuario **existente** en `users.id`; por defecto `sub`. En el realm incluido se emite `mercato_user_id` mediante un mapper de atributo de usuario. Los roles se consultan en la base de datos en cada operación REST.
- `MCP_REST_URL`: origen de esta misma API; por defecto `http://127.0.0.1:${PORT}`. Las llamadas tienen un timeout de 15 segundos y no siguen redirecciones.
- `MCP_ALLOWED_ORIGINS`: orígenes de clientes web permitidos, separados por comas. El origen de `MCP_PUBLIC_URL` está permitido automáticamente. Los clientes sin cabecera `Origin` también pueden conectarse.

El realm es de desarrollo: `mercato-cli` permite el flujo password para probar con `curl` y el usuario `admin` de Keycloak usa el UUID del usuario sembrado en Postgres. Ambos scopes son *default client scopes*, así que todo token válido los incluye (los permisos reales de escritura siguen dependiendo del rol en la base de datos). Si recreas la base de datos y el UUID del admin cambia, actualiza `users[0].id` y `users[0].attributes.mercato_user_id` en `keycloak/mercato-realm.json` antes de reimportar; puedes consultar el UUID actual con:

```bash
docker exec app-gestor-ventas-postgres-1 psql -U gestor -d gestor_ventas -tAc "select id from users where email='admin@tienda.local'"
```

Para reiniciar el realm desde el JSON (por ejemplo, tras editarlo) hay que borrar el volumen, porque la importación solo crea el realm si no existe:

```bash
docker compose rm -sf keycloak && docker volume rm app-gestor-ventas_keycloak_data
docker compose up -d keycloak
```

En un proveedor propio (Keycloak, Auth0, etc.):

1. Habilita **Authorization Code con PKCE S256 obligatorio**, redirecciones exactas registradas y consentimiento para los scopes. Deshabilita los flujos implicit.
2. Publica discovery OAuth/OIDC con los endpoints de autorización y token y soporte de PKCE S256.
3. Configura el recurso/audiencia con el valor exacto de `MCP_PUBLIC_URL` y los scopes **`mcp:read`** y **`mcp:write`**, emitidos en el claim `scope` separado por espacios. `mcp:read` es obligatorio para conectarse; las escrituras requieren además `mcp:write`.
4. Registra el cliente MCP y su callback en el proveedor, o habilita registro dinámico si lo admite el cliente. El login, consentimiento, intercambio de código, refresh y revocación pertenecen al proveedor. El recurso verifica los JWT localmente; su revocación se refleja al caducar, por lo que conviene emitir access tokens cortos.

**Importante:** `auth.example.com` solo aparece como marcador de posición en proveedores externos; con el Keycloak incluido el issuer es `http://localhost:8081/realms/mercato`. Tras cambiar `.env`, reinicia la API (`corepack pnpm dev` o guarda un archivo de `apps/api/src`) para recargar la configuración. Abrir `/mcp` en un navegador sin token responde **401**; incluso con token, este transporte stateless no atiende GET (responde **405**): usa un cliente MCP Streamable HTTP que envíe POST con un access token válido. Si `http://localhost:4000/health` tampoco responde, primero inicia la API con `corepack pnpm dev`.

Sin las tres variables `MCP_PUBLIC_URL`, `MCP_OAUTH_ISSUER` y `MCP_OAUTH_JWKS_URL`, `/mcp` responde `503`. Una configuración parcial impide arrancar. El panel sigue usando sus sesiones por cookie.

### Conexión y herramientas

Arranca con `corepack pnpm dev` y configura tu cliente MCP con transporte **Streamable HTTP** y URL **`http://localhost:4000/mcp`**. El cliente descubre el proveedor mediante el header `WWW-Authenticate` de la respuesta `401` y los metadatos públicos de **`/.well-known/oauth-protected-resource/mcp`** (también disponibles en `/.well-known/oauth-protected-resource`).

Con **MCP Inspector** (`npx @modelcontextprotocol/inspector`, UI en `http://localhost:6274`): transporte *Streamable HTTP*, URL `http://localhost:4000/mcp`, y en la configuración OAuth el **Client ID `mercato-mcp`** sin secreto (cliente público con PKCE S256). El callback ya está registrado en el realm. Inicia sesión con `admin` / `miclavesegura2026`.

| Herramienta | API REST | Acceso |
| --- | --- | --- |
| `list_products` | `GET /products` | Lectura |
| `list_sales` | `GET /sales` | Lectura |
| `list_inventory` | `GET /inventory` | Lectura |
| `get_dashboard` | `GET /dashboard` | Lectura |
| `create_sale` | `POST /sales` | Escritura |
| `create_product` | `POST /products` | Escritura + admin |
| `update_product` | `PATCH /products/:id` | Escritura + admin |
| `adjust_stock` | `POST /products/:id/stock` | Escritura + admin |
| `cancel_sale` | `POST /sales/:id/cancel` | Escritura + admin |

El transporte es stateless: una instancia por petición, respuestas JSON sobre Streamable HTTP, sin sesiones compartidas ni canal SSE persistente. `GET` y `DELETE` autenticados responden `405`; `OPTIONS` permite preflight CORS de orígenes autorizados. Cada `POST` exige `Authorization: Bearer <access_token>`.

Ejemplo con un access token del Keycloak local:

```bash
ACCESS_TOKEN=$(curl -s \
  -d grant_type=password -d client_id=mercato-cli \
  -d username=admin -d password=miclavesegura2026 \
  -d 'scope=openid mcp:read mcp:write' \
  http://localhost:8081/realms/mercato/protocol/openid-connect/token | jq -r .access_token)

curl http://localhost:4000/mcp \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

El access token OAuth solo se utiliza en `/mcp`. Para acceder a la API se genera una credencial interna de hasta 60 segundos (sin superar la caducidad OAuth), con clave, emisor y audiencia propios, vinculada al usuario y sus scopes. No se reenvían tokens OAuth ni cookies del cliente a la API REST.

Pruebas: `corepack pnpm --filter @gestor/api test`. Incluyen firma/audiencia/caducidad, discovery, transporte con cliente MCP real, scopes, aislamiento entre usuarios y llamadas a una API REST de prueba.
