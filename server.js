// @ts-check
const { cargarConfig } = require('./config');
const { crearPool, inicializarBaseDatos } = require('./db');
const { crearApp } = require('./app');
const { crearClasificador } = require('./ia/clasificador');
const { crearProveedorGemini } = require('./ia/gemini');
const { crearProveedorClaude } = require('./ia/claude');
const { crearRepositorioCategorias } = require('./repositorios/categorias');
const { crearRepositorioEscaneos } = require('./repositorios/escaneos');
const { crearRepositorioUsuarios } = require('./repositorios/usuarios');
const { crearServicioAuth } = require('./servicios/auth');
const { crearServicioEscaneos } = require('./servicios/escaneos');

const REINTENTO_BASE_MS = 15000;
const LIMITE_APAGADO_MS = 10000;

const config = cargarConfig();
const db = crearPool(config);

// Raíz de composición: el único lugar donde se conectan las piezas reales.
const { gemini, anthropic } = config;
const clasificador = crearClasificador([
  ...(gemini.apiKey ? [crearProveedorGemini({ apiKey: gemini.apiKey, modelo: gemini.modelo })] : []),
  ...(anthropic.apiKey ? [crearProveedorClaude({ apiKey: anthropic.apiKey, modelo: anthropic.modelo })] : [])
]);

const categorias = crearRepositorioCategorias(db);
const escaneos = crearRepositorioEscaneos(db);
const usuarios = crearRepositorioUsuarios(db);

const app = crearApp({
  origenes: config.origenes,
  produccion: config.produccion,
  comprobarBase: () => db.query('SELECT 1'),
  servicioAuth: crearServicioAuth({ usuarios, jwtSecret: config.jwtSecret }),
  servicioEscaneos: crearServicioEscaneos({ categorias, escaneos, clasificador }),
  categorias,
  escaneos,
  usuarios
});

/** @type {NodeJS.Timeout | undefined} */
let temporizadorReintento;

function prepararBaseDatos() {
  inicializarBaseDatos(db)
    .then(() => console.log('Base de datos lista.'))
    .catch((err) => {
      console.error('No se pudo preparar la base de datos:', err.message);
      temporizadorReintento = setTimeout(prepararBaseDatos, REINTENTO_BASE_MS);
    });
}

const servidor = app.listen(config.puerto, (err) => {
  if (err) throw err;
  console.log(`Backend de EcoScan escuchando en el puerto ${config.puerto}`);
  prepararBaseDatos();
});

/** Render envía SIGTERM en cada despliegue: se terminan las peticiones en curso y se cierra la base. */
function apagar() {
  console.log('Apagando el servidor...');
  clearTimeout(temporizadorReintento);
  setTimeout(() => process.exit(1), LIMITE_APAGADO_MS).unref();
  servidor.close(() => {
    db.end().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
