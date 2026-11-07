// @ts-check
const { withTransaction } = require('./pool');

// Serializes startup across instances: Render runs the old and new versions side by side during a deploy.
const STARTUP_LOCK_ID = 727001;

// `name` and `instructions` are content shown to users, so they stay in Spanish.
const CATEGORIES = [
  {
    key: 'organic',
    name: 'Orgánico / compostable',
    instructions: 'Va en el contenedor verde. Restos de comida, cáscaras, residuos de jardín.',
    binColor: 'green',
    points: 10
  },
  {
    key: 'paper_cardboard',
    name: 'Papel y cartón',
    instructions: 'Va en el contenedor azul. Dobla las cajas de cartón antes de desecharlas.',
    binColor: 'blue',
    points: 10
  },
  {
    key: 'plastic',
    name: 'Plástico',
    instructions: 'Va en el contenedor blanco/gris de reciclables. Enjuaga el envase si tuvo comida.',
    binColor: 'white',
    points: 15
  },
  {
    key: 'glass',
    name: 'Vidrio',
    instructions: 'Va en el contenedor de reciclables, idealmente separado para evitar roturas.',
    binColor: 'white',
    points: 15
  },
  {
    key: 'metal',
    name: 'Metal',
    instructions: 'Va en el contenedor de reciclables. Latas y tapas metálicas, de ser posible aplastadas.',
    binColor: 'white',
    points: 15
  },
  {
    key: 'non_recyclable',
    name: 'No reciclable',
    instructions: 'Va en el contenedor negro (basura ordinaria). Ej: empaques mixtos, icopor, papel higiénico.',
    binColor: 'black',
    points: 5
  }
];

/**
 * Creates the tables and loads the catalog. All of it runs in one transaction,
 * so a failure leaves the database untouched. Safe to repeat.
 * @param {import('pg').Pool} db
 */
async function initializeDatabase(db) {
  await withTransaction(db, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [STARTUP_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS categories (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        instructions TEXT NOT NULL,
        bin_color TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 10
      );

      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_key TEXT NOT NULL REFERENCES categories(key),
        confidence DOUBLE PRECISION NOT NULL,
        source TEXT NOT NULL DEFAULT 'heuristic',
        width_px INTEGER,
        height_px INTEGER,
        points_awarded INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Added after the first release, so existing databases need it as a separate step.
    await client.query(`
      ALTER TABLE scans ADD COLUMN IF NOT EXISTS thumbnail TEXT;
      CREATE INDEX IF NOT EXISTS scans_user_created_idx ON scans (user_id, created_at DESC);
    `);

    for (const category of CATEGORIES) {
      await client.query(
        `INSERT INTO categories (key, name, instructions, bin_color, points)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO NOTHING`,
        [category.key, category.name, category.instructions, category.binColor, category.points]
      );
    }
  });
}

module.exports = { initializeDatabase };
