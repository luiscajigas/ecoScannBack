// @ts-check
const { Pool } = require('pg');

/**
 * @param {{ databaseUrl: string, pgSsl: boolean }} options
 * @returns {Pool}
 */
function createPool({ databaseUrl, pgSsl }) {
  const db = new Pool({
    connectionString: databaseUrl,
    ssl: pgSsl ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });

  // Without this listener, an idle connection closed by the database crashes the process.
  db.on('error', (err) => {
    console.error('Error on an idle PostgreSQL connection:', err.message);
  });

  return db;
}

/**
 * Runs `work` inside a transaction: commits if it succeeds, rolls back if it throws.
 * @template T
 * @param {Pool} db
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withTransaction(db, work) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      console.error('Could not roll back the transaction:', rollbackError);
    });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createPool, withTransaction };
