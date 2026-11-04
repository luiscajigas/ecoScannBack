const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { levantarApi, USUARIO, ESCANEO } = require('./apoyo');

const IMAGEN = 'data:image/jpeg;base64,AAAA';

describe('autenticación', () => {
  let api;
  beforeEach(async () => { api = await levantarApi(); });
  afterEach(() => api.cerrar());

  const registrar = (datos = USUARIO) => api.pedir('/auth/registro', { metodo: 'POST', cuerpo: datos });

  test('el registro devuelve token y nunca el hash', async () => {
    const { status, json } = await registrar();
    assert.equal(status, 201);
    assert.ok(json.token);
    assert.equal(json.usuario.email, USUARIO.email);
    assert.equal(JSON.stringify(json).includes('passwordHash'), false);
  });

  test('un correo repetido responde 409 CORREO_EN_USO', async () => {
    await registrar();
    const { status, json } = await registrar();
    assert.equal(status, 409);
    assert.equal(json.codigo, 'CORREO_EN_USO');
  });

  for (const [caso, datos] of [
    ['correo inválido', { ...USUARIO, email: 'no-es-correo' }],
    ['contraseña corta', { ...USUARIO, password: '123' }],
    ['nombre vacío', { ...USUARIO, nombre: '' }],
    ['campo faltante', { email: USUARIO.email, password: USUARIO.password }],
    ['campo extra', { ...USUARIO, admin: true }],
    ['contraseña que no es texto', { ...USUARIO, password: 12345678 }]
  ]) {
    test(`el contrato rechaza el registro con ${caso}`, async () => {
      const { status, json } = await registrar(datos);
      assert.equal(status, 400);
      assert.equal(json.codigo, 'DATOS_INVALIDOS');
    });
  }

  test('login correcto y credenciales incorrectas', async () => {
    await registrar();
    const bien = await api.pedir('/auth/login', { metodo: 'POST', cuerpo: { email: USUARIO.email, password: USUARIO.password } });
    assert.equal(bien.status, 200);
    assert.ok(bien.json.token);

    const mal = await api.pedir('/auth/login', { metodo: 'POST', cuerpo: { email: USUARIO.email, password: 'otra-clave' } });
    assert.equal(mal.status, 401);
    assert.equal(mal.json.codigo, 'CREDENCIALES_INVALIDAS');
  });

  test('una petición sin cuerpo responde 400', async () => {
    const { status, json } = await api.pedir('/auth/login', { metodo: 'POST' });
    assert.equal(status, 400);
    assert.equal(json.codigo, 'DATOS_INVALIDOS');
  });

  test('un JSON roto responde 400 en el formato del contrato', async () => {
    const { status, json } = await api.pedir('/auth/login', { metodo: 'POST', cuerpo: '{roto' });
    assert.equal(status, 400);
    assert.equal(json.codigo, 'DATOS_INVALIDOS');
  });
});

describe('límite de intentos', () => {
  test('bloquea tras muchos intentos fallidos', async () => {
    const api = await levantarApi({ intentosAuth: 2 });
    try {
      const intento = () => api.pedir('/auth/login', { metodo: 'POST', cuerpo: { email: 'a@b.co', password: 'x' } });
      assert.equal((await intento()).status, 401);
      assert.equal((await intento()).status, 401);
      const bloqueado = await intento();
      assert.equal(bloqueado.status, 429);
      assert.equal(bloqueado.json.codigo, 'DEMASIADOS_INTENTOS');
    } finally {
      await api.cerrar();
    }
  });
});

describe('rutas protegidas', () => {
  let api;
  let token;
  before(async () => {
    api = await levantarApi();
    token = (await api.pedir('/auth/registro', { metodo: 'POST', cuerpo: USUARIO })).json.token;
  });
  after(() => api.cerrar());

  for (const [metodo, ruta] of [['GET', '/usuarios/me'], ['GET', '/escaneos'], ['POST', '/escaneos']]) {
    test(`${metodo} ${ruta} sin token responde 401 NO_AUTENTICADO`, async () => {
      const { status, json } = await api.pedir(ruta, { metodo, cuerpo: metodo === 'POST' ? ESCANEO : undefined });
      assert.equal(status, 401);
      assert.equal(json.codigo, 'NO_AUTENTICADO');
    });
  }

  test('un token falso responde 401 TOKEN_INVALIDO', async () => {
    const { status, json } = await api.pedir('/escaneos', { token: 'falso' });
    assert.equal(status, 401);
    assert.equal(json.codigo, 'TOKEN_INVALIDO');
  });

  test('el perfil devuelve al usuario sin datos privados', async () => {
    const { status, json } = await api.pedir('/usuarios/me', { token });
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(json).sort(), ['email', 'id', 'nombre', 'puntos']);
  });

  test('una categoría fuera del contrato responde 400', async () => {
    const { status } = await api.pedir('/escaneos', { metodo: 'POST', token, cuerpo: { ...ESCANEO, categoriaClave: 'carton' } });
    assert.equal(status, 400);
  });

  test('una confianza fuera de rango responde 400', async () => {
    const { status } = await api.pedir('/escaneos', { metodo: 'POST', token, cuerpo: { ...ESCANEO, confianza: 7 } });
    assert.equal(status, 400);
  });
});

describe('escaneos', () => {
  async function conUsuario(opciones) {
    const api = await levantarApi(opciones);
    const { json } = await api.pedir('/auth/registro', { metodo: 'POST', cuerpo: USUARIO });
    return { api, token: json.token };
  }

  test('sin IA usa la heurística y suma los puntos', async () => {
    const { api, token } = await conUsuario();
    try {
      const { status, json } = await api.pedir('/escaneos', { metodo: 'POST', token, cuerpo: ESCANEO });
      assert.equal(status, 201);
      assert.equal(json.origen, 'heuristica');
      assert.equal(json.categoria.clave, 'plastico');
      assert.equal(json.puntosTotales, 15);

      const historial = await api.pedir('/escaneos', { token });
      assert.equal(historial.status, 200);
      assert.equal(historial.json.length, 1);
    } finally {
      await api.cerrar();
    }
  });

  test('con IA, su clasificación reemplaza a la heurística', async () => {
    const clasificador = { disponible: true, clasificar: async () => ({ categoriaClave: 'metal', confianza: 0.9 }) };
    const { api, token } = await conUsuario({ clasificador });
    try {
      const { json } = await api.pedir('/escaneos', { metodo: 'POST', token, cuerpo: { ...ESCANEO, imagenBase64: IMAGEN } });
      assert.equal(json.origen, 'ia');
      assert.equal(json.categoria.clave, 'metal');
      assert.equal(json.confianza, 0.9);
    } finally {
      await api.cerrar();
    }
  });

  test('si la IA falla, responde igual con la heurística', async () => {
    const clasificador = { disponible: true, clasificar: async () => { throw new Error('saturada'); } };
    const { api, token } = await conUsuario({ clasificador });
    try {
      const { status, json } = await api.pedir('/escaneos', { metodo: 'POST', token, cuerpo: { ...ESCANEO, imagenBase64: IMAGEN } });
      assert.equal(status, 201);
      assert.equal(json.origen, 'heuristica');
    } finally {
      await api.cerrar();
    }
  });
});

describe('salud, rutas y CORS', () => {
  test('salud informa si la base responde o no', async () => {
    const bien = await levantarApi();
    const caida = await levantarApi({ comprobarBase: async () => { throw new Error('caída'); } });
    try {
      assert.equal((await bien.pedir('/salud')).json.baseDatos, 'conectada');
      const respuesta = await caida.pedir('/salud');
      assert.equal(respuesta.status, 503);
      assert.equal(respuesta.json.baseDatos, 'desconectada');
    } finally {
      await bien.cerrar();
      await caida.cerrar();
    }
  });

  test('categorías es público', async () => {
    const api = await levantarApi();
    try {
      const { status, json } = await api.pedir('/categorias');
      assert.equal(status, 200);
      assert.equal(json.length, 3);
    } finally {
      await api.cerrar();
    }
  });

  test('una ruta inexistente responde 404 RUTA_NO_ENCONTRADA', async () => {
    const api = await levantarApi();
    try {
      const { status, json } = await api.pedir('/no-existe');
      assert.equal(status, 404);
      assert.equal(json.codigo, 'RUTA_NO_ENCONTRADA');
    } finally {
      await api.cerrar();
    }
  });

  for (const [origen, permitido] of [
    ['https://eco-scann-fron.vercel.app', true],
    ['https://eco-scann-fron-n4wlsrp0r-luiscajigas-projects.vercel.app', true],
    ['https://eco-scann-fron-falso.vercel.app', false],
    ['https://malo.example.com', false],
    ['http://localhost:4200', false]
  ]) {
    test(`CORS en producción ${permitido ? 'permite' : 'rechaza'} ${origen}`, async () => {
      const api = await levantarApi();
      try {
        const { encabezados } = await api.pedir('/salud', { encabezados: { Origin: origen } });
        assert.equal(encabezados.get('access-control-allow-origin'), permitido ? origen : null);
      } finally {
        await api.cerrar();
      }
    });
  }

  test('CORS permite localhost fuera de producción', async () => {
    const api = await levantarApi({ produccion: false });
    try {
      const { encabezados } = await api.pedir('/salud', { encabezados: { Origin: 'http://localhost:4200' } });
      assert.equal(encabezados.get('access-control-allow-origin'), 'http://localhost:4200');
    } finally {
      await api.cerrar();
    }
  });
});
