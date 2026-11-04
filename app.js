// @ts-check
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet').default;
const { rateLimit } = require('express-rate-limit');
const OpenApiValidator = require('express-openapi-validator');

const { errores } = require('./errores');
const { crearOpcionesCors } = require('./middleware/cors');
const { manejarErrores, rutaNoEncontrada } = require('./middleware/errores');
const { crearRutasAuth } = require('./routes/auth');
const { crearRutasEscaneos } = require('./routes/escaneos');

const CONTRATO = path.join(__dirname, 'contrato', 'openapi.yaml');
const LIMITE_CUERPO = '5mb'; // la imagen comprimida viaja como base64
const VENTANA_INTENTOS_MS = 15 * 60 * 1000;
const INTENTOS_FALLIDOS_AUTH = 50; // alto a propósito: un salón entero puede compartir la misma IP

/**
 * @typedef {object} OpcionesApp
 * @property {string[]} origenes
 * @property {boolean} produccion
 * @property {() => Promise<unknown>} comprobarBase
 * @property {ReturnType<import('./servicios/auth').crearServicioAuth>} servicioAuth
 * @property {ReturnType<import('./servicios/escaneos').crearServicioEscaneos>} servicioEscaneos
 * @property {ReturnType<import('./repositorios/categorias').crearRepositorioCategorias>} categorias
 * @property {ReturnType<import('./repositorios/escaneos').crearRepositorioEscaneos>} escaneos
 * @property {ReturnType<import('./repositorios/usuarios').crearRepositorioUsuarios>} usuarios
 * @property {boolean} [validarRespuestas] Solo en pruebas: comprueba que las respuestas cumplan el contrato.
 * @property {number} [intentosAuth]
 */

/**
 * Construye la app sin abrir conexiones ni puertos, para poder probarla con
 * dependencias simuladas. La conexión real se arma en server.js.
 * @param {OpcionesApp} opciones
 */
function crearApp({
  origenes,
  produccion,
  comprobarBase,
  servicioAuth,
  servicioEscaneos,
  categorias,
  escaneos,
  usuarios,
  validarRespuestas = false,
  intentosAuth = INTENTOS_FALLIDOS_AUTH
}) {
  const app = express();

  app.set('trust proxy', 1); // Render atiende las peticiones detrás de un proxy
  app.use(helmet());
  app.use(cors(crearOpcionesCors({ origenes, produccion })));
  app.use(express.json({ limit: LIMITE_CUERPO }));

  app.use('/api/auth', rateLimit({
    windowMs: VENTANA_INTENTOS_MS,
    limit: intentosAuth,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(errores.demasiadosIntentos())
  }));

  app.use(OpenApiValidator.middleware({
    apiSpec: CONTRATO,
    validateRequests: true,
    validateResponses: validarRespuestas,
    validateSecurity: {
      handlers: {
        bearerAuth(req) {
          const encabezado = req.headers.authorization || '';
          if (!encabezado.startsWith('Bearer ')) throw errores.noAutenticado();
          /** @type {import('express').Request} */ (/** @type {unknown} */ (req)).usuarioId =
            servicioAuth.verificarToken(encabezado.slice('Bearer '.length));
          return true;
        }
      }
    }
  }));

  app.get('/api/salud', async (_req, res) => {
    const servicio = 'ecoscan-backend';
    try {
      await comprobarBase();
      res.json({ estado: 'ok', servicio, baseDatos: 'conectada' });
    } catch (err) {
      console.error('La base de datos no responde:', /** @type {Error} */ (err).message);
      res.status(503).json({ estado: 'error', servicio, baseDatos: 'desconectada' });
    }
  });

  app.use('/api/auth', crearRutasAuth(servicioAuth));
  app.use('/api', crearRutasEscaneos({ categorias, escaneos, usuarios, servicioEscaneos }));

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);

  return app;
}

module.exports = { crearApp };
