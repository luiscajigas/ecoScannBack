# EcoScan - Backend

API en Node.js y Express con autenticación JWT, PostgreSQL y clasificación con IA (Gemini, con Claude como respaldo).

El contrato de la API está en [`contract/openapi.yaml`](contract/openapi.yaml). Las decisiones de diseño y sus trade-offs están en [`docs/DECISIONES.md`](docs/DECISIONES.md).

## Ejecutar en local

1. Copia `.env.example` a `.env` y completa los valores.
2. Ejecuta `npm ci` y luego `npm run dev`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Ejecuta las pruebas; no necesitan base de datos |
| `npm run types` | Comprueba los tipos con TypeScript |
| `npm run contract:types` | Regenera `types/contract.d.ts` después de cambiar el contrato |

## Estructura

| Carpeta o archivo | Responsabilidad |
|---|---|
| `contract/` | Contrato OpenAPI, la fuente de verdad de la API |
| `server.js` | Arranque: conecta las piezas reales y apaga en orden |
| `app.js` | Configuración de Express, sin conexiones ni puertos |
| `routes/` | Controladores HTTP |
| `services/` | Reglas de negocio |
| `repositories/` | Consultas SQL |
| `ai/` | Proveedores de IA y cadena de respaldo |
| `middleware/` | CORS y manejo de errores |

## Variables en producción (Render)

| Variable | Valor |
|---|---|
| `DATABASE_URL` | URL de conexión de PostgreSQL |
| `PG_SSL` | `true` si la base exige TLS (Neon); `false` con la Internal URL de Render |
| `JWT_SECRET` | Secreto aleatorio de al menos 32 caracteres |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | Opcional: dominios extra separados por comas |
| `GEMINI_API_KEY` | Opcional: IA principal |
| `ANTHROPIC_API_KEY` | Opcional: Claude se usa solo si Gemini falla. Sin ninguna clave se usa la heurística de color |

El dominio https://eco-scann-fron.vercel.app ya está permitido en CORS.

## Comprobar el servicio

`GET /api/health` responde `database: "connected"` si todo está bien, o 503 si la base no está disponible.
