// @ts-check
const { errores } = require('../errores');

const VIOLACION_UNICA = '23505';

/** @typedef {import('../tipos/contrato').components['schemas']['Usuario']} Usuario */

/** @param {import('pg').Pool} db */
function crearRepositorioUsuarios(db) {
  return {
    /**
     * @param {{ nombre: string, email: string, passwordHash: string }} datos
     * @returns {Promise<Usuario>}
     */
    async crear({ nombre, email, passwordHash }) {
      try {
        const { rows } = await db.query(
          `INSERT INTO usuarios (nombre, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, nombre, email, puntos`,
          [nombre, email, passwordHash]
        );
        return rows[0];
      } catch (err) {
        if (/** @type {{ code?: string }} */ (err).code === VIOLACION_UNICA) throw errores.correoEnUso();
        throw err;
      }
    },

    /**
     * @param {string} email
     * @returns {Promise<(Usuario & { passwordHash: string }) | null>}
     */
    async buscarConHashPorEmail(email) {
      const { rows } = await db.query(
        `SELECT id, nombre, email, puntos, password_hash AS "passwordHash"
         FROM usuarios WHERE email = $1`,
        [email]
      );
      return rows[0] ?? null;
    },

    /**
     * @param {number} id
     * @returns {Promise<Usuario | null>}
     */
    async buscarPorId(id) {
      const { rows } = await db.query('SELECT id, nombre, email, puntos FROM usuarios WHERE id = $1', [id]);
      return rows[0] ?? null;
    }
  };
}

module.exports = { crearRepositorioUsuarios };
