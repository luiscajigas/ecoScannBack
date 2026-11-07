// @ts-check

/** @typedef {import('./types/contract').components['schemas']['ErrorCode']} ErrorCode */

/** Expected API error: it is sent to the client as is. */
class ApiError extends Error {
  /**
   * @param {number} status
   * @param {ErrorCode} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const errors = {
  invalidData: () => new ApiError(400, 'INVALID_DATA', 'The request data is invalid.'),
  notAuthenticated: () => new ApiError(401, 'NOT_AUTHENTICATED', 'Not authenticated: the token is missing.'),
  invalidToken: () => new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired token.'),
  invalidCredentials: () => new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.'),
  emailInUse: () => new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists.'),
  unknownCategory: () => new ApiError(400, 'UNKNOWN_CATEGORY', 'Unknown category.'),
  userNotFound: () => new ApiError(404, 'USER_NOT_FOUND', 'User not found.'),
  routeNotFound: () => new ApiError(404, 'ROUTE_NOT_FOUND', 'Route not found.'),
  imageTooLarge: () => new ApiError(413, 'IMAGE_TOO_LARGE', 'The image is too large.'),
  tooManyAttempts: () => new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Please wait a few minutes.'),
  internal: () => new ApiError(500, 'INTERNAL_ERROR', 'Internal server error.')
};

module.exports = { ApiError, errors };
