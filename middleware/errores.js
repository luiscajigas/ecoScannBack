// @ts-check
const { ErrorApi, errores } = require('../errores');

/**
 * Traduce cualquier error al formato del contrato. Express 5 envía aquí también
 * los errores de los controladores async, por eso las rutas no necesitan try/catch.
 * @param {any} err
 * @returns {ErrorApi}
 */
function convertirError(err) {
  if (err instanceof ErrorApi) return err;
  switch (err?.status) {
    case 400:
    case 415: // petición sin cuerpo JSON
      return errores.datosInvalidos();
    case 401:
      return err.message === errores.tokenInvalido().message ? errores.tokenInvalido() : errores.noAutenticado();
    case 404:
    case 405:
      return errores.rutaNoEncontrada();
    case 413:
      return errores.imagenDemasiadoGrande();
    default:
      return errores.interno();
  }
}

/** @type {import('express').RequestHandler} */
const rutaNoEncontrada = (_req, _res, next) => next(errores.rutaNoEncontrada());

/** @type {import('express').ErrorRequestHandler} */
const manejarErrores = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  const errorApi = convertirError(err);
  if (errorApi.status >= 500) console.error(err);
  res.status(errorApi.status).json({ error: errorApi.message, codigo: errorApi.codigo });
};

module.exports = { manejarErrores, rutaNoEncontrada };
