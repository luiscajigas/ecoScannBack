// @ts-check
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { errores } = require('../errores');

const RONDAS_BCRYPT = 10;
const DURACION_TOKEN = '7d';
const ALGORITMO = 'HS256';

/**
 * @typedef {import('../tipos/contrato').components['schemas']['RespuestaAuth']} RespuestaAuth
 * @typedef {import('../tipos/contrato').components['schemas']['SolicitudRegistro']} SolicitudRegistro
 * @typedef {import('../tipos/contrato').components['schemas']['SolicitudLogin']} SolicitudLogin
 * @typedef {ReturnType<import('../repositorios/usuarios').crearRepositorioUsuarios>} RepositorioUsuarios
 */

/** @param {{ usuarios: RepositorioUsuarios, jwtSecret: string }} dependencias */
function crearServicioAuth({ usuarios, jwtSecret }) {
  /** @param {number} usuarioId */
  const firmarToken = (usuarioId) =>
    jwt.sign({ usuarioId }, jwtSecret, { expiresIn: DURACION_TOKEN, algorithm: ALGORITMO });

  return {
    /**
     * @param {SolicitudRegistro} solicitud
     * @returns {Promise<RespuestaAuth>}
     */
    async registrar({ nombre, email, password }) {
      const passwordHash = await bcrypt.hash(password, RONDAS_BCRYPT);
      const usuario = await usuarios.crear({ nombre, email, passwordHash });
      return { token: firmarToken(usuario.id), usuario };
    },

    /**
     * @param {SolicitudLogin} solicitud
     * @returns {Promise<RespuestaAuth>}
     */
    async iniciarSesion({ email, password }) {
      const encontrado = await usuarios.buscarConHashPorEmail(email);
      if (!encontrado || !(await bcrypt.compare(password, encontrado.passwordHash))) {
        throw errores.credencialesInvalidas();
      }
      const { passwordHash: _hash, ...usuario } = encontrado;
      return { token: firmarToken(usuario.id), usuario };
    },

    /**
     * @param {string} token
     * @returns {number} id del usuario dueño del token
     */
    verificarToken(token) {
      try {
        const payload = /** @type {{ usuarioId: number }} */ (jwt.verify(token, jwtSecret, { algorithms: [ALGORITMO] }));
        return payload.usuarioId;
      } catch {
        throw errores.tokenInvalido();
      }
    }
  };
}

module.exports = { crearServicioAuth };
