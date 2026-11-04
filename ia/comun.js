// @ts-check

/**
 * @typedef {import('../tipos/contrato').components['schemas']['Categoria']} Categoria
 * @typedef {import('../tipos/contrato').components['schemas']['CategoriaClave']} CategoriaClave
 */

/**
 * @typedef {object} Imagen
 * @property {string} mimeType
 * @property {string} data
 *
 * @typedef {object} SolicitudClasificacion
 * @property {Imagen} imagen
 * @property {string} instruccion
 * @property {CategoriaClave[]} claves
 *
 * @typedef {object} Clasificacion
 * @property {CategoriaClave} categoriaClave
 * @property {number} confianza
 *
 * @typedef {object} ProveedorIA
 * @property {string} nombre
 * @property {(solicitud: SolicitudClasificacion) => Promise<Clasificacion>} clasificar
 */

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/**
 * @param {unknown} dataUrl
 * @returns {Imagen | null}
 */
function extraerImagen(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const coincidencia = DATA_URL.exec(dataUrl);
  return coincidencia ? { mimeType: coincidencia[1], data: coincidencia[2] } : null;
}

/** @param {Categoria[]} categorias */
function construirInstruccion(categorias) {
  const descripcion = categorias.map((c) => `- ${c.clave}: ${c.nombre}`).join('\n');
  return (
    'Eres un experto en reciclaje. Identifica el residuo principal de la foto y clasifícalo ' +
    'en exactamente una de estas categorías:\n' +
    `${descripcion}\n` +
    'Si la imagen no muestra un residuo claro, usa no_reciclable con confianza baja. ' +
    'confianza es un número entre 0 y 1.'
  );
}

/**
 * Valida la respuesta del modelo: aunque se pida un esquema, es un dato externo.
 * @param {string | undefined} texto
 * @param {CategoriaClave[]} claves
 * @returns {Clasificacion}
 */
function interpretarResultado(texto, claves) {
  if (!texto) throw new Error('La IA no devolvió una respuesta.');
  const resultado = JSON.parse(texto);

  if (!claves.includes(resultado.categoria)) {
    throw new Error('La IA devolvió una categoría desconocida.');
  }

  const confianza = Math.min(1, Math.max(0, Number(resultado.confianza) || 0));
  return { categoriaClave: resultado.categoria, confianza };
}

module.exports = { extraerImagen, construirInstruccion, interpretarResultado };
