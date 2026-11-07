// @ts-check
const express = require('express');
const { errors } = require('../errors');

/**
 * contract/openapi.yaml defines which routes require a session and which data is
 * valid: by the time these handlers run, the request has already been validated.
 * @param {object} dependencies
 * @param {ReturnType<import('../repositories/scans').createScanRepository>} dependencies.scans
 * @param {ReturnType<import('../repositories/users').createUserRepository>} dependencies.users
 * @param {ReturnType<import('../services/scans').createScanService>} dependencies.scanService
 * @param {ReturnType<import('../services/stats').createStatsService>} dependencies.statsService
 */
function createScanRoutes({ scans, users, scanService, statsService }) {
  const router = express.Router();

  router.get('/users/me', async (req, res) => {
    const user = await users.findById(/** @type {number} */ (req.userId));
    if (!user) throw errors.userNotFound();
    res.json(user);
  });

  router.get('/users/me/stats', async (req, res) => {
    const timeZone = /** @type {string | undefined} */ (req.query['timeZone']) ?? 'UTC';
    res.json(await statsService.getForUser(/** @type {number} */ (req.userId), timeZone));
  });

  router.get('/scans', async (req, res) => {
    const { limit, offset, category } = req.query;
    res.json(await scans.listByUser(/** @type {number} */ (req.userId), {
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
      category: /** @type {import('../repositories/scans').CategoryKey | undefined} */ (category)
    }));
  });

  router.post('/scans', async (req, res) => {
    res.status(201).json(await scanService.create(/** @type {number} */ (req.userId), req.body));
  });

  return router;
}

module.exports = { createScanRoutes };
