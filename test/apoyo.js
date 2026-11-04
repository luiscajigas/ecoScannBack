const { crearApp } = require('../app');
const { errores } = require('../errores');
const { crearServicioAuth } = require('../servicios/auth');
const { crearServicioEscaneos } = require('../servicios/escaneos');

const CATEGORIAS = [
  { clave: 'plastico', nombre: 'Plástico', instrucciones: 'Enjuágalo.', color_contenedor: 'blanco', puntos: 15 },
  { clave: 'metal', nombre: 'Metal', instrucciones: 'Aplástalo.', color_contenedor: 'blanco', puntos: 15 },
  { clave: 'no_reciclable', nombre: 'No reciclable', instrucciones: 'Contenedor negro.', color_contenedor: 'negro', puntos: 5 }
];

/** Repositorios en memoria con la misma interfaz que los reales. */
function crearRepositoriosFalsos() {
  const lista = [];
  const historial = [];

  const usuarios = {
    async crear({ nombre, email, passwordHash }) {
      if (lista.some((u) => u.email === email)) throw errores.correoEnUso();
      const usuario = { id: lista.length + 1, nombre, email, puntos: 0, passwordHash };
      lista.push(usuario);
      return { id: usuario.id, nombre, email, puntos: 0 };
    },
    async buscarConHashPorEmail(email) {
      return lista.find((u) => u.email === email) ?? null;
    },
    async buscarPorId(id) {
      const usuario = lista.find((u) => u.id === id);
      if (!usuario) return null;
      const { passwordHash: _hash, ...publico } = usuario;
      return publico;
    }
  };

  const categorias = { listar: async () => CATEGORIAS };

  const escaneos = {
    async listarPorUsuario(usuarioId) {
      return historial.filter((e) => e.usuarioId === usuarioId).map(({ usuarioId: _id, ...e }) => e);
    },
    async registrar({ usuarioId, categoriaClave, confianza, origen, puntos }) {
      const usuario = lista.find((u) => u.id === usuarioId);
      if (!usuario) throw errores.tokenInvalido();
      usuario.puntos += puntos;
      const categoria = CATEGORIAS.find((c) => c.clave === categoriaClave);
      const id = historial.length + 1;
      historial.push({
        usuarioId,
        id,
        categoria_clave: categoriaClave,
        categoria_nombre: categoria.nombre,
        instrucciones: categoria.instrucciones,
        color_contenedor: categoria.color_contenedor,
        confianza,
        origen,
        puntos_otorgados: puntos,
        creado_en: new Date().toISOString()
      });
      return { id, puntosTotales: usuario.puntos };
    }
  };

  return { usuarios, categorias, escaneos };
}

/**
 * Levanta la API en un puerto libre con las respuestas validadas contra el
 * contrato: si un controlador se desvía del contrato, la prueba falla con 500.
 */
async function levantarApi({ clasificador, comprobarBase, intentosAuth, produccion = true, origenes } = {}) {
  const repositorios = crearRepositoriosFalsos();
  const app = crearApp({
    origenes: origenes ?? ['https://eco-scann-fron.vercel.app'],
    produccion,
    comprobarBase: comprobarBase ?? (async () => {}),
    servicioAuth: crearServicioAuth({ usuarios: repositorios.usuarios, jwtSecret: 'x'.repeat(40) }),
    servicioEscaneos: crearServicioEscaneos({
      categorias: repositorios.categorias,
      escaneos: repositorios.escaneos,
      clasificador: clasificador ?? { disponible: false, clasificar: async () => { throw new Error('sin IA'); } }
    }),
    ...repositorios,
    validarRespuestas: true,
    intentosAuth
  });

  const servidor = await new Promise((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}/api`;

  async function pedir(ruta, { metodo = 'GET', cuerpo, token, encabezados = {} } = {}) {
    const respuesta = await fetch(base + ruta, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...encabezados
      },
      body: typeof cuerpo === 'string' ? cuerpo : cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
    const texto = await respuesta.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      json = null;
    }
    return { status: respuesta.status, json, encabezados: respuesta.headers };
  }

  return {
    pedir,
    cerrar: () => new Promise((resolver) => {
      servidor.close(resolver);
      servidor.closeAllConnections();
    })
  };
}

const USUARIO = { nombre: 'Ana', email: 'ana@ejemplo.com', password: 'secreto123' };
const ESCANEO = { categoriaClave: 'plastico', confianza: 0.6, anchoPx: 100, altoPx: 80 };

module.exports = { levantarApi, USUARIO, ESCANEO };
