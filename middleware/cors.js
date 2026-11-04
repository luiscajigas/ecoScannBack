// @ts-check

const VERCEL_PREVIEWS = /^https:\/\/eco-scann-fron-[a-z0-9-]+-luiscajigas-projects\.vercel\.app$/;
const LOCALHOST = /^http:\/\/localhost:\d+$/;

/**
 * @param {{ origins: string[], isProduction: boolean }} options
 * @returns {import('cors').CorsOptions}
 */
function createCorsOptions({ origins, isProduction }) {
  return {
    origin(origin, callback) {
      const isAllowed =
        !origin ||
        origins.includes(origin) ||
        VERCEL_PREVIEWS.test(origin) ||
        (!isProduction && LOCALHOST.test(origin));

      if (!isAllowed) console.warn(`Origin rejected by CORS: ${origin}`);
      callback(null, isAllowed);
    }
  };
}

module.exports = { createCorsOptions };
