// @ts-check

/** @typedef {import('../tipos/contrato').components['schemas']['Categoria']} Categoria */

/** @param {import('pg').Pool} db */
function crearRepositorioCategorias(db) {
  return {
    /** @returns {Promise<Categoria[]>} */
    async listar() {
      const { rows } = await db.query(
        'SELECT clave, nombre, instrucciones, color_contenedor, puntos FROM categorias ORDER BY clave'
      );
      return rows;
    }
  };
}

module.exports = { crearRepositorioCategorias };
