// @ts-check
require('dotenv').config({ quiet: true });

const PRODUCTION_ORIGIN = 'https://eco-scann-fron.vercel.app';
const MIN_SECRET_LENGTH = 32;

/**
 * @typedef {object} Config
 * @property {number | string} port
 * @property {boolean} isProduction
 * @property {string} databaseUrl
 * @property {boolean} pgSsl
 * @property {string} jwtSecret
 * @property {string[]} origins
 * @property {{ apiKey?: string, model?: string }} gemini
 * @property {{ apiKey?: string, model?: string }} anthropic
 */

/**
 * Reads and validates the environment variables. It fails at startup if
 * something required is missing, instead of failing later with the first user.
 * @param {Record<string, string | undefined>} [env]
 * @returns {Config}
 */
function loadConfig(env = process.env) {
  if (!env['DATABASE_URL']) {
    throw new Error('The DATABASE_URL environment variable is missing.');
  }
  const jwtSecret = env['JWT_SECRET'];
  if (!jwtSecret || jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET is required and must be at least ${MIN_SECRET_LENGTH} characters long.`);
  }

  return {
    port: env['PORT'] || 3002,
    isProduction: env['NODE_ENV'] === 'production',
    databaseUrl: env['DATABASE_URL'],
    pgSsl: env['PG_SSL'] === 'true',
    jwtSecret,
    origins: [PRODUCTION_ORIGIN, ...splitOrigins(env['CORS_ORIGIN'])],
    gemini: { apiKey: env['GEMINI_API_KEY'] || undefined, model: env['GEMINI_MODEL'] || undefined },
    anthropic: { apiKey: env['ANTHROPIC_API_KEY'] || undefined, model: env['ANTHROPIC_MODEL'] || undefined }
  };
}

/** @param {string | undefined} list */
function splitOrigins(list) {
  return (list || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

module.exports = { loadConfig };
