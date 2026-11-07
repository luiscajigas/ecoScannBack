// @ts-check
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet').default;
const { rateLimit } = require('express-rate-limit');
const OpenApiValidator = require('express-openapi-validator');

const { errors } = require('./errors');
const { createCorsOptions } = require('./middleware/cors');
const { handleErrors, routeNotFound } = require('./middleware/errors');
const { createAuthRoutes } = require('./routes/auth');
const { createCategoryRoutes } = require('./routes/categories');
const { createScanRoutes } = require('./routes/scans');
const { createUserRoutes } = require('./routes/users');

const CONTRACT = path.join(__dirname, 'contract', 'openapi.yaml');
const BODY_LIMIT = '5mb'; // the compressed image travels as base64
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_AUTH_ATTEMPTS = 50; // high on purpose: a whole classroom can share the same IP

/**
 * @typedef {object} AppOptions
 * @property {string[]} origins
 * @property {boolean} isProduction
 * @property {() => Promise<unknown>} checkDatabase
 * @property {ReturnType<import('./services/auth').createAuthService>} authService
 * @property {ReturnType<import('./services/scans').createScanService>} scanService
 * @property {ReturnType<import('./services/stats').createStatsService>} statsService
 * @property {ReturnType<import('./repositories/categories').createCategoryRepository>} categories
 * @property {ReturnType<import('./repositories/scans').createScanRepository>} scans
 * @property {ReturnType<import('./repositories/users').createUserRepository>} users
 * @property {boolean} [validateResponses] Tests only: checks that responses follow the contract.
 * @property {number} [maxAuthAttempts]
 */

/**
 * Builds the app without opening connections or ports, so it can be tested with
 * fake dependencies. The real wiring happens in server.js.
 * @param {AppOptions} options
 */
function createApp({
  origins,
  isProduction,
  checkDatabase,
  authService,
  scanService,
  statsService,
  categories,
  scans,
  users,
  validateResponses = false,
  maxAuthAttempts = MAX_FAILED_AUTH_ATTEMPTS
}) {
  const app = express();

  app.set('trust proxy', 1); // Render serves requests behind a proxy
  app.use(helmet());
  app.use(cors(createCorsOptions({ origins, isProduction })));
  app.use(express.json({ limit: BODY_LIMIT }));

  app.use('/api/auth', rateLimit({
    windowMs: ATTEMPT_WINDOW_MS,
    limit: maxAuthAttempts,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(errors.tooManyAttempts())
  }));

  app.use(OpenApiValidator.middleware({
    apiSpec: CONTRACT,
    validateRequests: true,
    validateResponses,
    validateSecurity: {
      handlers: {
        bearerAuth(req) {
          const header = req.headers.authorization || '';
          if (!header.startsWith('Bearer ')) throw errors.notAuthenticated();
          /** @type {import('express').Request} */ (/** @type {unknown} */ (req)).userId =
            authService.verifyToken(header.slice('Bearer '.length));
          return true;
        }
      }
    }
  }));

  app.get('/api/health', async (_req, res) => {
    const service = 'ecoscan-backend';
    try {
      await checkDatabase();
      res.json({ status: 'ok', service, database: 'connected' });
    } catch (err) {
      console.error('The database is not responding:', /** @type {Error} */ (err).message);
      res.status(503).json({ status: 'error', service, database: 'disconnected' });
    }
  });

  app.use('/api/auth', createAuthRoutes(authService));
  app.use('/api/categories', createCategoryRoutes(categories));
  app.use('/api/users', createUserRoutes({ users, statsService }));
  app.use('/api/scans', createScanRoutes({ scans, scanService }));

  app.use(routeNotFound);
  app.use(handleErrors);

  return app;
}

module.exports = { createApp };
