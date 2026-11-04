const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { crearClasificador } = require('../ia/clasificador');
const { crearProveedorGemini } = require('../ia/gemini');
const { extraerImagen, interpretarResultado } = require('../ia/comun');

const IMAGEN = 'data:image/jpeg;base64,AAAA';
const CATEGORIAS = [{ clave: 'metal', nombre: 'Metal' }, { clave: 'vidrio', nombre: 'Vidrio' }];
const CLAVES = ['metal', 'vidrio'];
const SOLICITUD = { imagen: { mimeType: 'image/jpeg', data: 'AAAA' }, instruccion: 'x', claves: CLAVES };

const proveedor = (nombre, resultado) => ({
  nombre,
  clasificar: mock.fn(async () => {
    if (resultado instanceof Error) throw resultado;
    return resultado;
  })
});

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'log', () => {});
});
afterEach(() => mock.restoreAll());

describe('cadena de proveedores', () => {
  test('el primero que responde gana y no se llama a los demás', async () => {
    const primero = proveedor('A', { categoriaClave: 'metal', confianza: 0.8 });
    const segundo = proveedor('B', { categoriaClave: 'vidrio', confianza: 0.8 });
    const resultado = await crearClasificador([primero, segundo]).clasificar(IMAGEN, CATEGORIAS);
    assert.equal(resultado.categoriaClave, 'metal');
    assert.equal(segundo.clasificar.mock.callCount(), 0);
  });

  test('si el primero falla, usa el siguiente', async () => {
    const primero = proveedor('A', new Error('saturado'));
    const segundo = proveedor('B', { categoriaClave: 'vidrio', confianza: 0.8 });
    const resultado = await crearClasificador([primero, segundo]).clasificar(IMAGEN, CATEGORIAS);
    assert.equal(resultado.categoriaClave, 'vidrio');
  });

  test('si todos fallan, lanza el último error', async () => {
    const clasificador = crearClasificador([proveedor('A', new Error('uno')), proveedor('B', new Error('dos'))]);
    await assert.rejects(clasificador.clasificar(IMAGEN, CATEGORIAS), /dos/);
  });

  test('sin proveedores no está disponible', () => {
    assert.equal(crearClasificador([]).disponible, false);
    assert.equal(crearClasificador([proveedor('A', new Error('x'))]).disponible, true);
  });

  test('una imagen inválida no llega a los proveedores', async () => {
    const primero = proveedor('A', { categoriaClave: 'metal', confianza: 1 });
    await assert.rejects(crearClasificador([primero]).clasificar('no-es-imagen', CATEGORIAS), /Imagen inválida/);
    assert.equal(primero.clasificar.mock.callCount(), 0);
  });
});

describe('proveedor Gemini', () => {
  const responder = (status, cuerpo) => new Response(JSON.stringify(cuerpo), { status });
  const exito = () => responder(200, {
    candidates: [{ content: { parts: [{ text: '{"categoria":"metal","confianza":0.7}' }] } }]
  });
  const gemini = () => crearProveedorGemini({ apiKey: 'clave', modelo: 'modelo-principal' });
  const modelosPedidos = (fetchFalso) =>
    fetchFalso.mock.calls.map((llamada) => decodeURIComponent(llamada.arguments[0]).match(/models\/([^:]+)/)[1]);

  test('si un modelo está saturado, prueba con los de respaldo', async () => {
    let llamadas = 0;
    const fetchFalso = mock.method(globalThis, 'fetch', async () =>
      (++llamadas < 3 ? responder(503, { error: { message: 'high demand' } }) : exito())
    );
    const resultado = await gemini().clasificar(SOLICITUD);
    assert.equal(resultado.categoriaClave, 'metal');
    assert.deepEqual(modelosPedidos(fetchFalso), ['modelo-principal', 'gemini-flash-latest', 'gemini-flash-lite-latest']);
  });

  test('si Google rechaza la clave, no insiste con otros modelos', async () => {
    const fetchFalso = mock.method(globalThis, 'fetch', async () => responder(400, { error: { message: 'API key not valid' } }));
    await assert.rejects(gemini().clasificar(SOLICITUD), /400/);
    assert.equal(fetchFalso.mock.callCount(), 1);
  });

  test('una respuesta sin texto cuenta como fallo y prueba el siguiente modelo', async () => {
    let llamadas = 0;
    const fetchFalso = mock.method(globalThis, 'fetch', async () =>
      (++llamadas === 1 ? responder(200, { candidates: [] }) : exito())
    );
    assert.equal((await gemini().clasificar(SOLICITUD)).categoriaClave, 'metal');
    assert.equal(fetchFalso.mock.callCount(), 2);
  });
});

describe('funciones comunes', () => {
  test('extraerImagen solo acepta formatos permitidos', () => {
    assert.deepEqual(extraerImagen(IMAGEN), { mimeType: 'image/jpeg', data: 'AAAA' });
    assert.equal(extraerImagen('data:image/gif;base64,AAAA'), null);
    assert.equal(extraerImagen(123), null);
  });

  test('interpretarResultado limita la confianza entre 0 y 1', () => {
    assert.equal(interpretarResultado('{"categoria":"metal","confianza":1.7}', CLAVES).confianza, 1);
    assert.equal(interpretarResultado('{"categoria":"metal","confianza":-2}', CLAVES).confianza, 0);
    assert.equal(interpretarResultado('{"categoria":"metal","confianza":"x"}', CLAVES).confianza, 0);
  });

  test('interpretarResultado rechaza categorías desconocidas y respuestas vacías', () => {
    assert.throws(() => interpretarResultado('{"categoria":"oro","confianza":1}', CLAVES), /desconocida/);
    assert.throws(() => interpretarResultado(undefined, CLAVES), /no devolvió/);
  });
});
