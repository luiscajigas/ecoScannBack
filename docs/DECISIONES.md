# Decisiones de arquitectura del backend

Cada decisión indica qué se eligió, qué se gana y qué se paga a cambio.

## Contract-first

**Decisión:** el contrato [`contrato/openapi.yaml`](../contrato/openapi.yaml) se escribe primero y es la única fuente de verdad. De él salen tres cosas:

1. **Validación de peticiones:** `express-openapi-validator` rechaza con 400 lo que no cumpla el contrato, antes de llegar a los controladores.
2. **Autenticación:** las rutas protegidas se declaran con `security` en el contrato, no ruta por ruta en el código.
3. **Tipos:** `npm run contrato:tipos` genera `tipos/contrato.d.ts`, y el frontend genera los suyos del mismo archivo.

**Se gana:** el contrato no se desactualiza, porque la app se rompe si no lo cumple. Las pruebas también validan las respuestas contra el contrato.

**Se paga:** una dependencia más y un paso extra al cambiar la API: primero el contrato, luego regenerar tipos.

## Tipado end-to-end

**Decisión:** el flujo de tipos es `openapi.yaml → tipos generados → backend (JSDoc) y frontend (TypeScript)`. Si cambia un campo o una categoría en el contrato, `npm run tipos` y el build de Angular fallan donde haya que ajustar.

**Por qué el backend sigue en JavaScript con `// @ts-check`:** migrarlo a TypeScript obligaría a agregar un paso de compilación al despliegue de Render, que hoy funciona con `node server.js`. Con JSDoc se comprueban los tipos con `tsc` sin cambiar lo que se ejecuta en producción.

**Se paga:** los comentarios JSDoc son más largos que la sintaxis de TypeScript, y los tipos solo se comprueban si se ejecuta `npm run tipos`.

## Paradigmas

| Parte | Paradigma | Motivo |
|---|---|---|
| Rutas y middleware | Funcional | Express compone funciones `(req, res, next)` |
| Servicios y repositorios | Funciones fábrica con inyección de dependencias | Sin clases ni `this`; las dependencias se pasan como parámetros y en pruebas se reemplazan por versiones en memoria |
| `ErrorApi` | Orientado a objetos | Es la forma idiomática de crear errores propios en JavaScript |
| SQL | Declarativo | Se describe qué datos se quieren y PostgreSQL decide cómo obtenerlos |

**Trade-off frente a clases:** las fábricas son más simples y no sufren problemas con `this`, pero no ofrecen herencia. Aquí no hace falta.

## Capas y patrones

```
routes → servicios → repositorios → PostgreSQL
              ↓
          ia/clasificador → Gemini → Claude
```

- **Repositorio:** solo `repositorios/` conoce el SQL.
- **Raíz de composición:** `server.js` es el único lugar que conecta las piezas reales; `app.js` no abre conexiones ni puertos, y por eso se puede probar.
- **Cadena de responsabilidad:** `ia/clasificador.js` intenta cada proveedor en orden. Agregar un proveedor no cambia ese archivo.
- **Estrategia:** Gemini y Claude cumplen la misma interfaz `ProveedorIA`.

**Se paga:** más archivos que antes. Para un proyecto de este tamaño es el límite razonable, y por eso no hay una capa de controladores aparte.

## Hilos y concurrencia

**Decisión: no usar `worker_threads` en el backend.**

Node atiende todas las peticiones en un solo hilo con un bucle de eventos. Los hilos solo ayudan cuando el trabajo ocupa la CPU, y aquí casi todo es espera de entrada y salida:

| Tarea | Tipo | ¿Bloquea el bucle de eventos? |
|---|---|---|
| Consultas a PostgreSQL | Entrada/salida | No |
| Llamadas a Gemini y Claude | Entrada/salida | No |
| `bcrypt.hash` y `bcrypt.compare` | CPU | Poco: bcryptjs reparte el trabajo en tramos y cede el control |
| Procesar la imagen | CPU | No ocurre aquí: lo hace el Web Worker en el navegador |

**Trade-off:** un pool de hilos para bcrypt agregaría complejidad sin beneficio con el tráfico de esta app, y el plan gratis de Render tampoco ofrece más núcleos que aprovechar. Si el login se volviera un cuello de botella, sería el primer candidato.

El trabajo pesado de CPU se resolvió en otro sitio: la imagen se reduce y se comprime en el Web Worker del navegador antes de viajar al servidor.

## Otras decisiones

- **Límite de intentos en `/api/auth`:** solo cuenta los fallidos, con 50 por IP cada 15 minutos. Es alto a propósito, porque un salón completo puede compartir la misma IP.
- **Pruebas con repositorios en memoria:** son rápidas y no necesitan base de datos, pero no ejecutan el SQL real. Ese código debe probarse aparte contra un PostgreSQL.
- **Errores con código estable:** el frontend traduce a partir de `codigo` y no compara textos en español, así que cambiar un mensaje no rompe las traducciones.

## Limitación conocida

La clasificación heurística la calcula el navegador, así que un cliente modificado podría enviar la categoría que quiera para sumar puntos. Para una app educativa es aceptable. Si los puntos tuvieran valor real, solo se deberían otorgar con clasificación del servidor.
