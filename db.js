// @ts-check
const { Pool } = require('pg');

// Serializes startup across instances: Render runs the old and new versions side by side during a deploy.
const STARTUP_LOCK_ID = 727001;

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
 * Renames the original Spanish schema to English, keeping every row. It runs
 * once: afterwards the old table no longer exists and this does nothing.
 * @param {import('pg').PoolClient} client
 */
async function migrateLegacySchema(client) {
  const { rows } = await client.query("SELECT to_regclass('usuarios') IS NOT NULL AS legacy");
  if (!rows[0].legacy) return;

  console.log('Migrating the database schema to English...');
  await client.query(`
    ALTER TABLE usuarios RENAME TO users;
    ALTER TABLE users RENAME COLUMN nombre TO name;
    ALTER TABLE users RENAME COLUMN puntos TO points;
    ALTER TABLE users RENAME COLUMN creado_en TO created_at;
    ALTER SEQUENCE usuarios_id_seq RENAME TO users_id_seq;
    ALTER TABLE users RENAME CONSTRAINT usuarios_pkey TO users_pkey;
    ALTER TABLE users RENAME CONSTRAINT usuarios_email_key TO users_email_key;

    ALTER TABLE categorias RENAME TO categories;
    ALTER TABLE categories RENAME COLUMN clave TO key;
    ALTER TABLE categories RENAME COLUMN nombre TO name;
    ALTER TABLE categories RENAME COLUMN instrucciones TO instructions;
    ALTER TABLE categories RENAME COLUMN color_contenedor TO bin_color;
    ALTER TABLE categories RENAME COLUMN puntos TO points;
    ALTER TABLE categories RENAME CONSTRAINT categorias_pkey TO categories_pkey;

    ALTER TABLE escaneos RENAME TO scans;
    ALTER TABLE scans RENAME COLUMN usuario_id TO user_id;
    ALTER TABLE scans RENAME COLUMN categoria_clave TO category_key;
    ALTER TABLE scans RENAME COLUMN confianza TO confidence;
    ALTER TABLE scans RENAME COLUMN origen TO source;
    ALTER TABLE scans RENAME COLUMN ancho_px TO width_px;
    ALTER TABLE scans RENAME COLUMN alto_px TO height_px;
    ALTER TABLE scans RENAME COLUMN puntos_otorgados TO points_awarded;
    ALTER TABLE scans RENAME COLUMN creado_en TO created_at;
    ALTER SEQUENCE escaneos_id_seq RENAME TO scans_id_seq;
    ALTER TABLE scans RENAME CONSTRAINT escaneos_pkey TO scans_pkey;
    ALTER TABLE scans RENAME CONSTRAINT escaneos_usuario_id_fkey TO scans_user_id_fkey;

    ALTER TABLE scans DROP CONSTRAINT escaneos_categoria_clave_fkey;

    UPDATE categories SET
      key = CASE key
        WHEN 'organico' THEN 'organic'
        WHEN 'papel_carton' THEN 'paper_cardboard'
        WHEN 'plastico' THEN 'plastic'
        WHEN 'vidrio' THEN 'glass'
        WHEN 'no_reciclable' THEN 'non_recyclable'
        ELSE key
      END,
      bin_color = CASE bin_color
        WHEN 'verde' THEN 'green'
        WHEN 'azul' THEN 'blue'
        WHEN 'blanco' THEN 'white'
        WHEN 'negro' THEN 'black'
        ELSE bin_color
      END;

    UPDATE scans SET
      category_key = CASE category_key
        WHEN 'organico' THEN 'organic'
        WHEN 'papel_carton' THEN 'paper_cardboard'
        WHEN 'plastico' THEN 'plastic'
        WHEN 'vidrio' THEN 'glass'
        WHEN 'no_reciclable' THEN 'non_recyclable'
        ELSE category_key
      END,
      source = CASE source WHEN 'ia' THEN 'ai' WHEN 'heuristica' THEN 'heuristic' ELSE source END;

    ALTER TABLE scans ALTER COLUMN source SET DEFAULT 'heuristic';
    ALTER TABLE scans ADD CONSTRAINT scans_category_key_fkey
      FOREIGN KEY (category_key) REFERENCES categories(key);
  `);

  // PostgreSQL 18 also stores NOT NULL constraints by name; older versions return nothing here.
  const { rows: notNullConstraints } = await client.query(`
    SELECT c.conname AS name, t.relname AS table_name, a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'n' AND t.relname IN ('users', 'categories', 'scans')
  `);
  for (const { name, table_name: table, column_name: column } of notNullConstraints) {
    await client.query(`ALTER TABLE ${table} RENAME CONSTRAINT "${name}" TO "${table}_${column}_not_null"`);
  }

  console.log('Database schema migrated to English.');
}

/**
 * Migrates old data, creates the tables and loads the catalog. All of it runs
 * in one transaction, so a failure leaves the database untouched. Safe to repeat.
 * @param {Pool} db
 */
async function initializeDatabase(db) {
  await withTransaction(db, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [STARTUP_LOCK_ID]);
    await migrateLegacySchema(client);

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

module.exports = { createPool, withTransaction, initializeDatabase };
