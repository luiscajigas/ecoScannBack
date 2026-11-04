// @ts-check

const PREVIEWS_VERCEL = /^https:\/\/eco-scann-fron-[a-z0-9-]+-luiscajigas-projects\.vercel\.app$/;
const LOCALHOST = /^http:\/\/localhost:\d+$/;

/**
 * @param {{ origenes: string[], produccion: boolean }} opciones
 * @returns {import('cors').CorsOptions}
 */
function crearOpcionesCors({ origenes, produccion }) {
  return {
    origin(origen, callback) {
      const permitido =
        !origen ||
        origenes.includes(origen) ||
        PREVIEWS_VERCEL.test(origen) ||
        (!produccion && LOCALHOST.test(origen));

      if (!permitido) console.warn(`Origen rechazado por CORS: ${origen}`);
      callback(null, permitido);
    }
  };
}

module.exports = { crearOpcionesCors };
