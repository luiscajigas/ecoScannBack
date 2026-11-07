// @ts-check
const express = require('express');

/** @param {ReturnType<import('../repositories/categories').createCategoryRepository>} categories */
function createCategoryRoutes(categories) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    res.json(await categories.list());
  });

  return router;
}

module.exports = { createCategoryRoutes };
