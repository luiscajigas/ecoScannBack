// @ts-check
const { withTransaction } = require('../db');
const { errors } = require('../errors');

const FOREIGN_KEY_VIOLATION = '23503';
const DEFAULT_HISTORY_LIMIT = 50;

/**
 * @typedef {import('../types/contract').components['schemas']['Scan']} Scan
 * @typedef {import('../types/contract').components['schemas']['CategoryKey']} CategoryKey
 * @typedef {import('../types/contract').components['schemas']['ClassificationSource']} ClassificationSource
 */

/** @param {import('pg').Pool} db */
function createScanRepository(db) {
  return {
    /**
     * @param {number} userId
     * @param {{ limit?: number, offset?: number, category?: CategoryKey }} [options]
     * @returns {Promise<Scan[]>}
     */
    async listByUser(userId, { limit = DEFAULT_HISTORY_LIMIT, offset = 0, category } = {}) {
      const { rows } = await db.query(
        `SELECT s.id, s.category_key AS "categoryKey", c.name AS "categoryName", c.instructions,
                c.bin_color AS "binColor", s.confidence, s.source,
                s.points_awarded AS "pointsAwarded", s.created_at AS "createdAt", s.thumbnail
         FROM scans s
         JOIN categories c ON c.key = s.category_key
         WHERE s.user_id = $1 AND ($4::text IS NULL OR s.category_key = $4)
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset, category ?? null]
      );
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    },

    /**
     * Saves the scan and adds the points in a single transaction.
     * @param {object} data
     * @param {number} data.userId
     * @param {CategoryKey} data.categoryKey
     * @param {number} data.confidence
     * @param {ClassificationSource} data.source
     * @param {number} data.widthPx
     * @param {number} data.heightPx
     * @param {number} data.points
     * @param {string | null} data.thumbnail
     * @returns {Promise<{ id: number, totalPoints: number }>}
     */
    async create({ userId, categoryKey, confidence, source, widthPx, heightPx, points, thumbnail }) {
      try {
        return await withTransaction(db, async (client) => {
          const scan = await client.query(
            `INSERT INTO scans (user_id, category_key, confidence, source, width_px, height_px, points_awarded, thumbnail)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [userId, categoryKey, confidence, source, widthPx, heightPx, points, thumbnail]
          );
          const user = await client.query(
            'UPDATE users SET points = points + $1 WHERE id = $2 RETURNING points',
            [points, userId]
          );
          return { id: scan.rows[0].id, totalPoints: user.rows[0].points };
        });
      } catch (err) {
        // Valid token of a user who no longer exists (for example, after switching databases).
        if (/** @type {{ code?: string }} */ (err).code === FOREIGN_KEY_VIOLATION) throw errors.invalidToken();
        throw err;
      }
    }
  };
}

module.exports = { createScanRepository };
