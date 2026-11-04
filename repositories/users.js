// @ts-check
const { errors } = require('../errors');

const UNIQUE_VIOLATION = '23505';

/** @typedef {import('../types/contract').components['schemas']['User']} User */

/** @param {import('pg').Pool} db */
function createUserRepository(db) {
  return {
    /**
     * @param {{ name: string, email: string, passwordHash: string }} data
     * @returns {Promise<User>}
     */
    async create({ name, email, passwordHash }) {
      try {
        const { rows } = await db.query(
          `INSERT INTO users (name, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, name, email, points`,
          [name, email, passwordHash]
        );
        return rows[0];
      } catch (err) {
        if (/** @type {{ code?: string }} */ (err).code === UNIQUE_VIOLATION) throw errors.emailInUse();
        throw err;
      }
    },

    /**
     * @param {string} email
     * @returns {Promise<(User & { passwordHash: string }) | null>}
     */
    async findWithHashByEmail(email) {
      const { rows } = await db.query(
        `SELECT id, name, email, points, password_hash AS "passwordHash"
         FROM users WHERE email = $1`,
        [email]
      );
      return rows[0] ?? null;
    },

    /**
     * @param {number} id
     * @returns {Promise<User | null>}
     */
    async findById(id) {
      const { rows } = await db.query('SELECT id, name, email, points FROM users WHERE id = $1', [id]);
      return rows[0] ?? null;
    }
  };
}

module.exports = { createUserRepository };
