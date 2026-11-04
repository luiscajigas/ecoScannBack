// @ts-check
const { construirInstruccion, extraerImagen } = require('./comun');

/**
 * @typedef {import('./comun').Categoria} Categoria
 * @typedef {import('./comun').Clasificacion} Clasificacion
 * @typedef {import('./comun').ProveedorIA} ProveedorIA
 *
 * @typedef {object} Clasificador
 * @property {boolean} disponible
 * @property {(dataUrl: unknown, categorias: Categoria[]) => Promise<Clasificacion>} clasificar
 */

/**
 * Cadena de responsabilidad: cada proveedor se intenta en orden y el primero
 * que responda gana. Agregar un proveedor no obliga a cambiar este archivo.
 * @param {ProveedorIA[]} proveedores
 * @returns {Clasificador}
 */
function crearClasificador(proveedores) {
  return {
    disponible: proveedores.length > 0,
    async clasificar(dataUrl, categorias) {
      const imagen = extraerImagen(dataUrl);
      if (!imagen) throw new Error('Imagen inválida.');

      const solicitud = {
        imagen,
        instruccion: construirInstruccion(categorias),
        claves: categorias.map((c) => c.clave)
      };

      /** @type {unknown} */
      let ultimoError = new Error('No hay proveedores de IA configurados.');
      for (const [indice, proveedor] of proveedores.entries()) {
        try {
          const resultado = await proveedor.clasificar(solicitud);
          if (indice > 0) console.log(`Clasificación hecha con ${proveedor.nombre} como respaldo.`);
          return resultado;
        } catch (err) {
          ultimoError = err;
          console.warn(`${proveedor.nombre} falló: ${/** @type {Error} */ (err).message}`);
        }
      }
      throw ultimoError;
    }
  };
}

module.exports = { crearClasificador };
