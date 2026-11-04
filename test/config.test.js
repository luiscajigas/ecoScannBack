const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../config');

const VALID = { DATABASE_URL: 'postgresql://u:p@h/b', JWT_SECRET: 'x'.repeat(32) };

describe('configuration', () => {
  test('fails if DATABASE_URL is missing', () => {
    assert.throws(() => loadConfig({ JWT_SECRET: VALID.JWT_SECRET }), /DATABASE_URL/);
  });

  test('fails if JWT_SECRET is missing or short', () => {
    assert.throws(() => loadConfig({ DATABASE_URL: VALID.DATABASE_URL }), /JWT_SECRET/);
    assert.throws(() => loadConfig({ ...VALID, JWT_SECRET: 'short' }), /JWT_SECRET/);
  });

  test('always allows the production domain', () => {
    assert.deepEqual(loadConfig(VALID).origins, ['https://eco-scann-fron.vercel.app']);
  });

  test('cleans spaces and trailing slashes from CORS_ORIGIN', () => {
    const { origins } = loadConfig({ ...VALID, CORS_ORIGIN: ' https://a.com/ , https://b.com,, ' });
    assert.deepEqual(origins.slice(1), ['https://a.com', 'https://b.com']);
  });

  test('an empty AI key counts as not configured', () => {
    assert.equal(loadConfig({ ...VALID, GEMINI_API_KEY: '' }).gemini.apiKey, undefined);
  });
});
