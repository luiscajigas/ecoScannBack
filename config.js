// @ts-check
require('dotenv').config({ quiet: true });

const ORIGEN_PRODUCCION = 'https://eco-scann-fron.vercel.app';
const LARGO_MINIMO_SECRETO = 32;

/**
 * @typedef {object} Config
 * @property {number | string} puerto
 * @property {boolean} produccion
 * @property {string} databaseUrl
 * @property {boolean} pgSsl
 * @property {string} jwtSecret
 * @property {string[]} origenes
 * @property {{ apiKey?: string, modelo?: string }} gemini
 * @property {{ apiKey?: string, modelo?: string }} anthropic
 */

/**
 * Lee y valida las variables de entorno. Falla al arrancar si falta algo
 * obligatorio, en lugar de fallar más tarde con el primer usuario.
 * @param {Record<string, string | undefined>} [env]
 * @returns {Config}
 */
function cargarConfig(env = process.env) {
  if (!env['DATABASE_URL']) {
    throw new Error('Falta la variable de entorno DATABASE_URL.');
  }
  const jwtSecret = env['JWT_SECRET'];
  if (!jwtSecret || jwtSecret.length < LARGO_MINIMO_SECRETO) {
    throw new Error(`JWT_SECRET es obligatorio y debe tener al menos ${LARGO_MINIMO_SECRETO} caracteres.`);
  }

  return {
    puerto: env['PORT'] || 3002,
    produccion: env['NODE_ENV'] === 'production',
    databaseUrl: env['DATABASE_URL'],
    pgSsl: env['PG_SSL'] === 'true',
    jwtSecret,
    origenes: [ORIGEN_PRODUCCION, ...separarOrigenes(env['CORS_ORIGIN'])],
    gemini: { apiKey: env['GEMINI_API_KEY'] || undefined, modelo: env['GEMINI_MODEL'] || undefined },
    anthropic: { apiKey: env['ANTHROPIC_API_KEY'] || undefined, modelo: env['ANTHROPIC_MODEL'] || undefined }
  };
}

/** @param {string | undefined} lista */
function separarOrigenes(lista) {
  return (lista || '')
    .split(',')
    .map((origen) => origen.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

module.exports = { cargarConfig };
