const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('Falta la variable de entorno DATABASE_URL.');
}

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: true } : false
});

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

async function inicializarBaseDatos() {
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

module.exports = { db, inicializarBaseDatos };
