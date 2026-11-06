// @ts-check
const { loadConfig } = require('./config');
const { createPool, initializeDatabase } = require('./db');
const { createApp } = require('./app');
const { createClassifier } = require('./ai/classifier');
const { createGeminiProvider } = require('./ai/gemini');
const { createClaudeProvider } = require('./ai/claude');
const { createCategoryRepository } = require('./repositories/categories');
const { createScanRepository } = require('./repositories/scans');
const { createUserRepository } = require('./repositories/users');
const { createAuthService } = require('./services/auth');
const { createScanService } = require('./services/scans');
const { createStatsService } = require('./services/stats');

const DATABASE_RETRY_MS = 15000;
const SHUTDOWN_LIMIT_MS = 10000;

const config = loadConfig();
const db = createPool(config);

// Composition root: the only place where the real pieces are wired together.
const { gemini, anthropic } = config;
const classifier = createClassifier([
  ...(gemini.apiKey ? [createGeminiProvider({ apiKey: gemini.apiKey, model: gemini.model })] : []),
  ...(anthropic.apiKey ? [createClaudeProvider({ apiKey: anthropic.apiKey, model: anthropic.model })] : [])
]);

const categories = createCategoryRepository(db);
const scans = createScanRepository(db);
const users = createUserRepository(db);

const app = createApp({
  origins: config.origins,
  isProduction: config.isProduction,
  checkDatabase: () => db.query('SELECT 1'),
  authService: createAuthService({ users, jwtSecret: config.jwtSecret }),
  scanService: createScanService({ categories, scans, classifier }),
  statsService: createStatsService({ scans }),
  categories,
  scans,
  users
});

/** @type {NodeJS.Timeout | undefined} */
let retryTimer;

function prepareDatabase() {
  initializeDatabase(db)
    .then(() => console.log('Database ready.'))
    .catch((err) => {
      console.error('Could not prepare the database:', err.message);
      retryTimer = setTimeout(prepareDatabase, DATABASE_RETRY_MS);
    });
}

const server = app.listen(config.port, (err) => {
  if (err) throw err;
  console.log(`EcoScan backend listening on port ${config.port}`);
  prepareDatabase();
});

/** Render sends SIGTERM on every deploy: finish in-flight requests and close the database. */
function shutDown() {
  console.log('Shutting down the server...');
  clearTimeout(retryTimer);
  setTimeout(() => process.exit(1), SHUTDOWN_LIMIT_MS).unref();
  server.close(() => {
    db.end().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
