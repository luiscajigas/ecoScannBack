// @ts-check
const express = require('express');

/** @param {ReturnType<import('../services/auth').createAuthService>} authService */
function createAuthRoutes(authService) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    res.status(201).json(await authService.register(req.body));
  });

  router.post('/login', async (req, res) => {
    res.json(await authService.logIn(req.body));
  });

  return router;
}

module.exports = { createAuthRoutes };
