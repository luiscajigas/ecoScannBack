// @ts-check
const express = require('express');

/**
 * contract/openapi.yaml defines which routes require a session and which data is
 * valid: by the time these handlers run, the request has already been validated.
 * @param {object} dependencies
 * @param {ReturnType<import('../repositories/scans').createScanRepository>} dependencies.scans
 * @param {ReturnType<import('../services/scans').createScanService>} dependencies.scanService
 */
function createScanRoutes({ scans, scanService }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { limit, offset, category } = req.query;
    res.json(await scans.listByUser(/** @type {number} */ (req.userId), {
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
      category: /** @type {import('../repositories/scans').CategoryKey | undefined} */ (category)
    }));
  });

  router.post('/', async (req, res) => {
    res.status(201).json(await scanService.create(/** @type {number} */ (req.userId), req.body));
  });

  return router;
}

module.exports = { createScanRoutes };
