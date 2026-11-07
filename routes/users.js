// @ts-check
const express = require('express');
const { errors } = require('../errors');

/**
 * @param {object} dependencies
 * @param {ReturnType<import('../repositories/users').createUserRepository>} dependencies.users
 * @param {ReturnType<import('../services/stats').createStatsService>} dependencies.statsService
 */
function createUserRoutes({ users, statsService }) {
  const router = express.Router();

  router.get('/me', async (req, res) => {
    const user = await users.findById(/** @type {number} */ (req.userId));
    if (!user) throw errors.userNotFound();
    res.json(user);
  });

  router.get('/me/stats', async (req, res) => {
    const timeZone = /** @type {string | undefined} */ (req.query['timeZone']) ?? 'UTC';
    res.json(await statsService.getForUser(/** @type {number} */ (req.userId), timeZone));
  });

  return router;
}

module.exports = { createUserRoutes };
