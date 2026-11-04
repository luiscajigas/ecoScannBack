// @ts-check
const { interpretarResultado } = require('./comun');

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELO_PREDETERMINADO = 'gemini-3.8-flash';
// Si un modelo está saturado se prueba el siguiente; el lite suele tener menos demanda.
const MODELOS_RESPALDO = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const TIMEOUT_MS = 10000;
// Estos errores no se arreglan cambiando de modelo: el problema es la clave o la petición.
const ESTADOS_DEFINITIVOS = [400, 401, 403];

/**
 * @typedef {import('./comun').SolicitudClasificacion} SolicitudClasificacion
 * @typedef {import('./comun').ProveedorIA} ProveedorIA
 */

/**
 * @param {SolicitudClasificacion} solicitud
 */
function construirCuerpo({ imagen, instruccion, claves }) {
  return {
    contents: [
      {
        parts: [
          { text: instruccion },
          { inline_data: { mime_type: imagen.mimeType, data: imagen.data } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          categoria: { type: 'STRING', enum: claves },
          confianza: { type: 'NUMBER' }
        },
        required: ['categoria', 'confianza']
      }
    }
  };
}

/** @param {Response} respuesta */
async function crearErrorDeRespuesta(respuesta) {
  const cuerpo = await respuesta.json().catch(() => null);
  const mensaje = cuerpo?.error?.message || '';
  const error = new Error(`Gemini respondió ${respuesta.status}${mensaje ? `: ${mensaje.slice(0, 300)}` : '.'}`);
  return Object.assign(error, { definitivo: ESTADOS_DEFINITIVOS.includes(respuesta.status) });
}

/**
 * @param {{ apiKey: string, modelo?: string }} opciones
 * @returns {ProveedorIA}
 */
function crearProveedorGemini({ apiKey, modelo = MODELO_PREDETERMINADO }) {
  const modelos = [...new Set([modelo, ...MODELOS_RESPALDO])];

  /**
   * @param {string} nombreModelo
   * @param {SolicitudClasificacion} solicitud
   */
  async function consultar(nombreModelo, solicitud) {
    const respuesta = await fetch(`${URL_BASE}/${encodeURIComponent(nombreModelo)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(construirCuerpo(solicitud)),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!respuesta.ok) throw await crearErrorDeRespuesta(respuesta);

    const json = await respuesta.json();
    return interpretarResultado(json?.candidates?.[0]?.content?.parts?.[0]?.text, solicitud.claves);
  }

  return {
    nombre: 'Gemini',
    async clasificar(solicitud) {
      /** @type {unknown} */
      let ultimoError;
      for (const nombreModelo of modelos) {
        try {
          return await consultar(nombreModelo, solicitud);
        } catch (err) {
          ultimoError = err;
          console.warn(`Gemini ${nombreModelo} falló: ${/** @type {Error} */ (err).message}`);
          if (/** @type {{ definitivo?: boolean }} */ (err).definitivo) break;
        }
      }
      throw ultimoError;
    }
  };
}

module.exports = { crearProveedorGemini };
