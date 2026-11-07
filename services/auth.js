// @ts-check
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { errors } = require('../errors');

const BCRYPT_ROUNDS = 10;
const TOKEN_LIFETIME = '7d';
const ALGORITHM = 'HS256';

/**
 * @typedef {import('../types/contract').components['schemas']['AuthResponse']} AuthResponse
 * @typedef {import('../types/contract').components['schemas']['RegisterRequest']} RegisterRequest
 * @typedef {import('../types/contract').components['schemas']['LoginRequest']} LoginRequest
 * @typedef {ReturnType<import('../repositories/users').createUserRepository>} UserRepository
 */

/** @param {{ users: UserRepository, jwtSecret: string }} dependencies */
function createAuthService({ users, jwtSecret }) {
  /** @param {number} userId */
  const signToken = (userId) =>
    jwt.sign({ userId }, jwtSecret, { expiresIn: TOKEN_LIFETIME, algorithm: ALGORITHM });

  return {
    /**
     * @param {RegisterRequest} request
     * @returns {Promise<AuthResponse>}
     */
    async register({ name, email, password }) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user = await users.create({ name, email, passwordHash });
      return { token: signToken(user.id), user };
    },

    /**
     * @param {LoginRequest} request
     * @returns {Promise<AuthResponse>}
     */
    async logIn({ email, password }) {
      const found = await users.findWithHashByEmail(email);
      if (!found || !(await bcrypt.compare(password, found.passwordHash))) {
        throw errors.invalidCredentials();
      }
      const { passwordHash: _hash, ...user } = found;
      return { token: signToken(user.id), user };
    },

    /**
     * @param {string} token
     * @returns {number} id of the user who owns the token
     */
    verifyToken(token) {
      let payload;
      try {
        payload = /** @type {{ userId?: unknown }} */ (jwt.verify(token, jwtSecret, { algorithms: [ALGORITHM] }));
      } catch {
        throw errors.invalidToken();
      }
      // A valid signature is not enough: the payload must have the expected shape.
      if (typeof payload.userId !== 'number') throw errors.invalidToken();
      return payload.userId;
    }
  };
}

module.exports = { createAuthService };
