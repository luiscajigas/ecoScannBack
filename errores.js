// @ts-check

/** @typedef {import('./tipos/contrato').components['schemas']['CodigoError']} CodigoError */

/** Error esperado de la API: se responde tal cual al cliente. */
class ErrorApi extends Error {
  /**
   * @param {number} status
   * @param {CodigoError} codigo
   * @param {string} mensaje
   */
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.codigo = codigo;
  }
}

const errores = {
  datosInvalidos: () => new ErrorApi(400, 'DATOS_INVALIDOS', 'Revisa los datos: usa un correo válido y una contraseña de al menos 8 caracteres.'),
  noAutenticado: () => new ErrorApi(401, 'NO_AUTENTICADO', 'No autenticado. Falta el token.'),
  tokenInvalido: () => new ErrorApi(401, 'TOKEN_INVALIDO', 'Token inválido o expirado.'),
  credencialesInvalidas: () => new ErrorApi(401, 'CREDENCIALES_INVALIDAS', 'Credenciales inválidas.'),
  correoEnUso: () => new ErrorApi(409, 'CORREO_EN_USO', 'Ya existe una cuenta con ese correo.'),
  categoriaDesconocida: () => new ErrorApi(400, 'CATEGORIA_DESCONOCIDA', 'Categoría no reconocida.'),
  usuarioNoEncontrado: () => new ErrorApi(404, 'USUARIO_NO_ENCONTRADO', 'Usuario no encontrado.'),
  rutaNoEncontrada: () => new ErrorApi(404, 'RUTA_NO_ENCONTRADA', 'Ruta no encontrada.'),
  imagenDemasiadoGrande: () => new ErrorApi(413, 'IMAGEN_DEMASIADO_GRANDE', 'La imagen es demasiado grande.'),
  demasiadosIntentos: () => new ErrorApi(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espera unos minutos.'),
  interno: () => new ErrorApi(500, 'ERROR_INTERNO', 'Error interno del servidor.')
};

module.exports = { ErrorApi, errores };
