// @ts-check
const express = require('express');

/** @param {ReturnType<import('../servicios/auth').crearServicioAuth>} servicioAuth */
function crearRutasAuth(servicioAuth) {
  const router = express.Router();

  router.post('/registro', async (req, res) => {
    res.status(201).json(await servicioAuth.registrar(req.body));
  });

  router.post('/login', async (req, res) => {
    res.json(await servicioAuth.iniciarSesion(req.body));
  });

  return router;
}

module.exports = { crearRutasAuth };
