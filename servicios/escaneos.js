// @ts-check
const { errores } = require('../errores');

/**
 * @typedef {import('../tipos/contrato').components['schemas']['Categoria']} Categoria
 * @typedef {import('../tipos/contrato').components['schemas']['SolicitudEscaneo']} SolicitudEscaneo
 * @typedef {import('../tipos/contrato').components['schemas']['ResultadoEscaneo']} ResultadoEscaneo
 * @typedef {import('../tipos/contrato').components['schemas']['OrigenClasificacion']} OrigenClasificacion
 * @typedef {import('../ia/clasificador').Clasificador} Clasificador
 * @typedef {ReturnType<import('../repositorios/categorias').crearRepositorioCategorias>} RepositorioCategorias
 * @typedef {ReturnType<import('../repositorios/escaneos').crearRepositorioEscaneos>} RepositorioEscaneos
 */

/**
 * @param {object} dependencias
 * @param {RepositorioCategorias} dependencias.categorias
 * @param {RepositorioEscaneos} dependencias.escaneos
 * @param {Clasificador} dependencias.clasificador
 */
function crearServicioEscaneos({ categorias, escaneos, clasificador }) {
  /**
   * La IA decide si está disponible; si falla, se usa la heurística del Worker.
   * @param {SolicitudEscaneo} solicitud
   * @param {Categoria[]} catalogo
   * @returns {Promise<{ categoriaClave: SolicitudEscaneo['categoriaClave'], confianza: number, origen: OrigenClasificacion }>}
   */
  async function clasificar({ categoriaClave, confianza, imagenBase64 }, catalogo) {
    if (imagenBase64 && clasificador.disponible) {
      try {
        const resultado = await clasificador.clasificar(imagenBase64, catalogo);
        return { ...resultado, origen: 'ia' };
      } catch (err) {
        console.error('Clasificación con IA fallida, se usa la heurística:', /** @type {Error} */ (err).message);
      }
    }
    return { categoriaClave, confianza, origen: 'heuristica' };
  }

  return {
    /**
     * @param {number} usuarioId
     * @param {SolicitudEscaneo} solicitud
     * @returns {Promise<ResultadoEscaneo>}
     */
    async registrar(usuarioId, solicitud) {
      const catalogo = await categorias.listar();
      const { categoriaClave, confianza, origen } = await clasificar(solicitud, catalogo);

      const categoria = catalogo.find((c) => c.clave === categoriaClave);
      if (!categoria) throw errores.categoriaDesconocida();

      const { id, puntosTotales } = await escaneos.registrar({
        usuarioId,
        categoriaClave,
        confianza,
        origen,
        anchoPx: solicitud.anchoPx,
        altoPx: solicitud.altoPx,
        puntos: categoria.puntos
      });

      return {
        id,
        categoria: {
          clave: categoria.clave,
          nombre: categoria.nombre,
          instrucciones: categoria.instrucciones,
          color_contenedor: categoria.color_contenedor
        },
        origen,
        confianza,
        puntosOtorgados: categoria.puntos,
        puntosTotales
      };
    }
  };
}

module.exports = { crearServicioEscaneos };
