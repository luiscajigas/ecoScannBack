// @ts-check

/** @typedef {import('../types/contract').components['schemas']['Category']} Category */

/** @param {import('pg').Pool} db */
function createCategoryRepository(db) {
  return {
    /** @returns {Promise<Category[]>} */
    async list() {
      const { rows } = await db.query(
        'SELECT key, name, instructions, bin_color AS "binColor", points FROM categories ORDER BY key'
      );
      return rows;
    }
  };
}

module.exports = { createCategoryRepository };
