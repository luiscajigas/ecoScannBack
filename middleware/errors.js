// @ts-check
const { ApiError, errors } = require('../errors');

/**
 * Turns any error into the contract's format. Express 5 also sends errors from
 * async handlers here, which is why the routes do not need try/catch.
 * @param {any} err
 * @returns {ApiError}
 */
function toApiError(err) {
  if (err instanceof ApiError) return err;
  switch (err?.status) {
    case 400:
    case 415: // request without a JSON body
      return errors.invalidData();
    case 401:
      return err.message === errors.invalidToken().message ? errors.invalidToken() : errors.notAuthenticated();
    case 404:
    case 405:
      return errors.routeNotFound();
    case 413:
      return errors.imageTooLarge();
    default:
      return errors.internal();
  }
}

/** @type {import('express').RequestHandler} */
const routeNotFound = (_req, _res, next) => next(errors.routeNotFound());

/** @type {import('express').ErrorRequestHandler} */
const handleErrors = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  const apiError = toApiError(err);
  if (apiError.status >= 500) console.error(err);
  res.status(apiError.status).json({ error: apiError.message, code: apiError.code });
};

module.exports = { handleErrors, routeNotFound };
