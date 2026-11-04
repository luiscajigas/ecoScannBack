// @ts-check
const { enTransaccion } = require('../db');
const { errores } = require('../errores');

const VIOLACION_LLAVE_FORANEA = '23503';
const LIMITE_HISTORIAL = 50;

/**
 * @typedef {import('../tipos/contrato').components['schemas']['Escaneo']} Escaneo
 * @typedef {import('../tipos/contrato').components['schemas']['CategoriaClave']} CategoriaClave
 * @typedef {import('../tipos/contrato').components['schemas']['OrigenClasificacion']} OrigenClasificacion
 */

/** @param {import('pg').Pool} db */
function crearRepositorioEscaneos(db) {
  return {
    /**
     * @param {number} usuarioId
     * @returns {Promise<Escaneo[]>}
     */
    async listarPorUsuario(usuarioId) {
      const { rows } = await db.query(
        `SELECT e.id, e.categoria_clave, c.nombre AS categoria_nombre, c.instrucciones, c.color_contenedor,
                e.confianza, e.origen, e.puntos_otorgados, e.creado_en
         FROM escaneos e
         JOIN categorias c ON c.clave = e.categoria_clave
         WHERE e.usuario_id = $1
         ORDER BY e.creado_en DESC
         LIMIT $2`,
        [usuarioId, LIMITE_HISTORIAL]
      );
      return rows.map((fila) => ({ ...fila, creado_en: fila.creado_en.toISOString() }));
    },

    /**
     * Guarda el escaneo y suma los puntos en una sola transacción.
     * @param {object} datos
     * @param {number} datos.usuarioId
     * @param {CategoriaClave} datos.categoriaClave
     * @param {number} datos.confianza
     * @param {OrigenClasificacion} datos.origen
     * @param {number} datos.anchoPx
     * @param {number} datos.altoPx
     * @param {number} datos.puntos
     * @returns {Promise<{ id: number, puntosTotales: number }>}
     */
    async registrar({ usuarioId, categoriaClave, confianza, origen, anchoPx, altoPx, puntos }) {
      try {
        return await enTransaccion(db, async (cliente) => {
          const escaneo = await cliente.query(
            `INSERT INTO escaneos (usuario_id, categoria_clave, confianza, origen, ancho_px, alto_px, puntos_otorgados)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [usuarioId, categoriaClave, confianza, origen, anchoPx, altoPx, puntos]
          );
          const usuario = await cliente.query(
            'UPDATE usuarios SET puntos = puntos + $1 WHERE id = $2 RETURNING puntos',
            [puntos, usuarioId]
          );
          return { id: escaneo.rows[0].id, puntosTotales: usuario.rows[0].puntos };
        });
      } catch (err) {
        // Token válido de un usuario que ya no existe (por ejemplo, si se cambió la base).
        if (/** @type {{ code?: string }} */ (err).code === VIOLACION_LLAVE_FORANEA) throw errores.tokenInvalido();
        throw err;
      }
    }
  };
}

module.exports = { crearRepositorioEscaneos };
