const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { cargarConfig } = require('../config');

const VALIDA = { DATABASE_URL: 'postgresql://u:p@h/b', JWT_SECRET: 'x'.repeat(32) };

describe('configuración', () => {
  test('falla si falta DATABASE_URL', () => {
    assert.throws(() => cargarConfig({ JWT_SECRET: VALIDA.JWT_SECRET }), /DATABASE_URL/);
  });

  test('falla si JWT_SECRET falta o es corto', () => {
    assert.throws(() => cargarConfig({ DATABASE_URL: VALIDA.DATABASE_URL }), /JWT_SECRET/);
    assert.throws(() => cargarConfig({ ...VALIDA, JWT_SECRET: 'corto' }), /JWT_SECRET/);
  });

  test('siempre permite el dominio de producción', () => {
    assert.deepEqual(cargarConfig(VALIDA).origenes, ['https://eco-scann-fron.vercel.app']);
  });

  test('limpia espacios y barras finales de CORS_ORIGIN', () => {
    const { origenes } = cargarConfig({ ...VALIDA, CORS_ORIGIN: ' https://a.com/ , https://b.com,, ' });
    assert.deepEqual(origenes.slice(1), ['https://a.com', 'https://b.com']);
  });

  test('una clave vacía de IA cuenta como no configurada', () => {
    assert.equal(cargarConfig({ ...VALIDA, GEMINI_API_KEY: '' }).gemini.apiKey, undefined);
  });
});
