const express = require('express');
const { db } = require('../db');
const { requiereAuth } = require('../middleware/auth');
const { iaDisponible, clasificarConIA } = require('../ia');

const router = express.Router();

/**
 * GET /api/categorias
 * Catálogo de categorías de reciclaje (público, sirve para armar la UI).
 */
router.get('/categorias', async (req, res) => {
  try {
    const resultado = await db.query('SELECT * FROM categorias');
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar las categorías.' });
  }
});

/**
 * GET /api/usuarios/me
 */
router.get('/usuarios/me', requiereAuth, async (req, res) => {
  try {
    const resultado = await db.query(
      'SELECT id, nombre, email, puntos FROM usuarios WHERE id = $1',
      [req.usuarioId]
    );
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar el usuario.' });
  }
});

/**
 * GET /api/escaneos
 * Historial de escaneos del usuario autenticado, más reciente primero.
 */
router.get('/escaneos', requiereAuth, async (req, res) => {
  try {
    const resultado = await db.query(
      `SELECT e.*, c.nombre AS categoria_nombre, c.instrucciones, c.color_contenedor
       FROM escaneos e JOIN categorias c ON c.clave = e.categoria_clave
       WHERE e.usuario_id = $1
       ORDER BY e.creado_en DESC
       LIMIT 50`,
      [req.usuarioId]
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar el historial.' });
  }
});

/**
 * POST /api/escaneos
 * Registra un escaneo. Si llega la imagen comprimida y la IA está
 * configurada, Gemini clasifica el residuo; si no está disponible o falla,
 * se usa la heurística de color calculada por el Web Worker.
 *
 * Body: { categoriaClave, confianza, anchoPx, altoPx, imagenBase64? }
 */
router.post('/escaneos', requiereAuth, async (req, res) => {
  const { anchoPx, altoPx, imagenBase64 } = req.body;
  let { categoriaClave, confianza } = req.body;
  let origen = 'heuristica';

  let categorias;
  try {
    categorias = (await db.query('SELECT * FROM categorias')).rows;
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al consultar la categoría.' });
  }

  if (imagenBase64 && iaDisponible()) {
    try {
      const ia = await clasificarConIA(imagenBase64, categorias);
      categoriaClave = ia.categoriaClave;
      confianza = ia.confianza;
      origen = 'ia';
    } catch (err) {
      console.error('Clasificación con IA fallida, se usa la heurística:', err.message);
    }
  }

  const categoria = categorias.find((c) => c.clave === categoriaClave);
  if (!categoria) {
    return res.status(400).json({ error: 'Categoría no reconocida.' });
  }

  const puntosOtorgados = categoria.puntos;

  let client;
  let id;
  let usuario;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const escaneo = await client.query(
      `INSERT INTO escaneos (usuario_id, categoria_clave, confianza, origen, ancho_px, alto_px, puntos_otorgados)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [req.usuarioId, categoriaClave, confianza ?? 0, origen, anchoPx ?? null, altoPx ?? null, puntosOtorgados]
    );
    await client.query('UPDATE usuarios SET puntos = puntos + $1 WHERE id = $2', [puntosOtorgados, req.usuarioId]);
    const usuarioResultado = await client.query('SELECT puntos FROM usuarios WHERE id = $1', [req.usuarioId]);
    await client.query('COMMIT');
    id = escaneo.rows[0].id;
    usuario = usuarioResultado.rows[0];
  } catch (err) {
    console.error(err);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('No se pudo revertir la transacción del escaneo:', rollbackError);
      }
    }
    return res.status(500).json({ error: 'Error al guardar el escaneo.' });
  } finally {
    if (client) client.release();
  }

  res.status(201).json({
    id,
    categoria: {
      clave: categoria.clave,
      nombre: categoria.nombre,
      instrucciones: categoria.instrucciones,
      color_contenedor: categoria.color_contenedor
    },
    origen,
    confianza: confianza ?? 0,
    puntosOtorgados,
    puntosTotales: usuario.puntos
  });
});

module.exports = router;
