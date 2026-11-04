# EcoScan - Backend

API en Node.js y Express con autenticación JWT, PostgreSQL y clasificación con Gemini.

## Ejecutar en local

1. Copia `.env.example` a `.env` y completa los valores.
2. Ejecuta `npm ci` y luego `npm run dev`.

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

`GET /api/salud` responde `baseDatos: "conectada"` si todo está bien, o 503 si la base no está disponible.
