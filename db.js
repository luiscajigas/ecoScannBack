// @ts-check
const { Pool } = require('pg');

/**
 * @param {{ databaseUrl: string, pgSsl: boolean }} opciones
 * @returns {Pool}
 */
function crearPool({ databaseUrl, pgSsl }) {
  const db = new Pool({
    connectionString: databaseUrl,
    ssl: pgSsl ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });

  // Sin este listener, una conexión inactiva cerrada por la base tumba el proceso.
  db.on('error', (err) => {
    console.error('Error en una conexión inactiva de PostgreSQL:', err.message);
  });

  return db;
}

/**
 * Ejecuta `trabajo` dentro de una transacción: confirma si termina bien y
 * revierte si lanza un error.
 * @template T
 * @param {Pool} db
 * @param {(cliente: import('pg').PoolClient) => Promise<T>} trabajo
 * @returns {Promise<T>}
 */
async function enTransaccion(db, trabajo) {
  const cliente = await db.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await trabajo(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch((errorRollback) => {
      console.error('No se pudo revertir la transacción:', errorRollback);
    });
    throw err;
  } finally {
    cliente.release();
  }
}

const categorias = [
  {
    clave: 'organico',
    nombre: 'Orgánico / compostable',
    instrucciones: 'Va en el contenedor verde. Restos de comida, cáscaras, residuos de jardín.',
    color_contenedor: 'verde',
    puntos: 10
  },
  {
    clave: 'papel_carton',
    nombre: 'Papel y cartón',
    instrucciones: 'Va en el contenedor azul. Dobla las cajas de cartón antes de desecharlas.',
    color_contenedor: 'azul',
    puntos: 10
  },
  {
    clave: 'plastico',
    nombre: 'Plástico',
    instrucciones: 'Va en el contenedor blanco/gris de reciclables. Enjuaga el envase si tuvo comida.',
    color_contenedor: 'blanco',
    puntos: 15
  },
  {
    clave: 'vidrio',
    nombre: 'Vidrio',
    instrucciones: 'Va en el contenedor de reciclables, idealmente separado para evitar roturas.',
    color_contenedor: 'blanco',
    puntos: 15
  },
  {
    clave: 'metal',
    nombre: 'Metal',
    instrucciones: 'Va en el contenedor de reciclables. Latas y tapas metálicas, de ser posible aplastadas.',
    color_contenedor: 'blanco',
    puntos: 15
  },
  {
    clave: 'no_reciclable',
    nombre: 'No reciclable',
    instrucciones: 'Va en el contenedor negro (basura ordinaria). Ej: empaques mixtos, icopor, papel higiénico.',
    color_contenedor: 'negro',
    puntos: 5
  }
];

/**
 * Crea las tablas y carga el catálogo; se puede ejecutar varias veces.
 * @param {Pool} db
 */
async function inicializarBaseDatos(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      puntos INTEGER NOT NULL DEFAULT 0,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS categorias (
      clave TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      instrucciones TEXT NOT NULL,
      color_contenedor TEXT NOT NULL,
      puntos INTEGER NOT NULL DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS escaneos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      categoria_clave TEXT NOT NULL REFERENCES categorias(clave),
      confianza DOUBLE PRECISION NOT NULL,
      origen TEXT NOT NULL DEFAULT 'heuristica',
      ancho_px INTEGER,
      alto_px INTEGER,
      puntos_otorgados INTEGER NOT NULL DEFAULT 0,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (const categoria of categorias) {
    await db.query(
      `INSERT INTO categorias (clave, nombre, instrucciones, color_contenedor, puntos)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (clave) DO NOTHING`,
      [categoria.clave, categoria.nombre, categoria.instrucciones, categoria.color_contenedor, categoria.puntos]
    );
  }
}

module.exports = { crearPool, enTransaccion, inicializarBaseDatos };
