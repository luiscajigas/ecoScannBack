// @ts-check
const express = require('express');
const { errors } = require('../errors');

/**
 * contract/openapi.yaml defines which routes require a session and which data is
 * valid: by the time these handlers run, the request has already been validated.
 * @param {object} dependencies
 * @param {ReturnType<import('../repositories/categories').createCategoryRepository>} dependencies.categories
 * @param {ReturnType<import('../repositories/scans').createScanRepository>} dependencies.scans
 * @param {ReturnType<import('../repositories/users').createUserRepository>} dependencies.users
 * @param {ReturnType<import('../services/scans').createScanService>} dependencies.scanService
 */
function createScanRoutes({ categories, scans, users, scanService }) {
  const router = express.Router();

  router.get('/categories', async (_req, res) => {
    res.json(await categories.list());
  });

  router.get('/users/me', async (req, res) => {
    const user = await users.findById(/** @type {number} */ (req.userId));
    if (!user) throw errors.userNotFound();
    res.json(user);
  });

  router.get('/scans', async (req, res) => {
    res.json(await scans.listByUser(/** @type {number} */ (req.userId)));
  });

  router.post('/scans', async (req, res) => {
    res.status(201).json(await scanService.create(/** @type {number} */ (req.userId), req.body));
  });

  return router;
}

module.exports = { createScanRoutes };
