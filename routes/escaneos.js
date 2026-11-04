// @ts-check
const express = require('express');
const { errores } = require('../errores');

/**
 * Qué rutas exigen sesión y qué datos son válidos lo define contrato/openapi.yaml:
 * cuando estos controladores se ejecutan, la petición ya fue validada.
 * @param {object} dependencias
 * @param {ReturnType<import('../repositorios/categorias').crearRepositorioCategorias>} dependencias.categorias
 * @param {ReturnType<import('../repositorios/escaneos').crearRepositorioEscaneos>} dependencias.escaneos
 * @param {ReturnType<import('../repositorios/usuarios').crearRepositorioUsuarios>} dependencias.usuarios
 * @param {ReturnType<import('../servicios/escaneos').crearServicioEscaneos>} dependencias.servicioEscaneos
 */
function crearRutasEscaneos({ categorias, escaneos, usuarios, servicioEscaneos }) {
  const router = express.Router();

  router.get('/categorias', async (_req, res) => {
    res.json(await categorias.listar());
  });

  router.get('/usuarios/me', async (req, res) => {
    const usuario = await usuarios.buscarPorId(/** @type {number} */ (req.usuarioId));
    if (!usuario) throw errores.usuarioNoEncontrado();
    res.json(usuario);
  });

  router.get('/escaneos', async (req, res) => {
    res.json(await escaneos.listarPorUsuario(/** @type {number} */ (req.usuarioId)));
  });

  router.post('/escaneos', async (req, res) => {
    res.status(201).json(await servicioEscaneos.registrar(/** @type {number} */ (req.usuarioId), req.body));
  });

  return router;
}

module.exports = { crearRutasEscaneos };
