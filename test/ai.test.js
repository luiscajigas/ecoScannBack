const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createClassifier } = require('../ai/classifier');
const { createGeminiProvider } = require('../ai/gemini');
const { extractImage, parseResult } = require('../ai/common');

const IMAGE = 'data:image/jpeg;base64,AAAA';
const CATEGORIES = [{ key: 'metal', name: 'Metal' }, { key: 'glass', name: 'Glass' }];
const KEYS = ['metal', 'glass'];
const REQUEST = { image: { mimeType: 'image/jpeg', data: 'AAAA' }, instruction: 'x', keys: KEYS };

const provider = (name, result) => ({
  name,
  classify: mock.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  })
});

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'log', () => {});
});
afterEach(() => mock.restoreAll());

describe('provider chain', () => {
  test('the first one to respond wins and the others are not called', async () => {
    const first = provider('A', { categoryKey: 'metal', confidence: 0.8 });
    const second = provider('B', { categoryKey: 'glass', confidence: 0.8 });
    const result = await createClassifier([first, second]).classify(IMAGE, CATEGORIES);
    assert.equal(result.categoryKey, 'metal');
    assert.equal(second.classify.mock.callCount(), 0);
  });

  test('if the first one fails, it uses the next one', async () => {
    const first = provider('A', new Error('overloaded'));
    const second = provider('B', { categoryKey: 'glass', confidence: 0.8 });
    const result = await createClassifier([first, second]).classify(IMAGE, CATEGORIES);
    assert.equal(result.categoryKey, 'glass');
  });

  test('if they all fail, it throws the last error', async () => {
    const classifier = createClassifier([provider('A', new Error('one')), provider('B', new Error('two'))]);
    await assert.rejects(classifier.classify(IMAGE, CATEGORIES), /two/);
  });

  test('without providers it is not available', () => {
    assert.equal(createClassifier([]).isAvailable, false);
    assert.equal(createClassifier([provider('A', new Error('x'))]).isAvailable, true);
  });

  test('an invalid image does not reach the providers', async () => {
    const first = provider('A', { categoryKey: 'metal', confidence: 1 });
    await assert.rejects(createClassifier([first]).classify('not-an-image', CATEGORIES), /Invalid image/);
    assert.equal(first.classify.mock.callCount(), 0);
  });
});

describe('Gemini provider', () => {
  const respond = (status, body) => new Response(JSON.stringify(body), { status });
  const success = () => respond(200, {
    candidates: [{ content: { parts: [{ text: '{"category":"metal","confidence":0.7}' }] } }]
  });
  const gemini = () => createGeminiProvider({ apiKey: 'key', model: 'main-model' });
  const requestedModels = (fakeFetch) =>
    fakeFetch.mock.calls.map((call) => decodeURIComponent(call.arguments[0]).match(/models\/([^:]+)/)[1]);

  test('if a model is overloaded, it tries the fallback models', async () => {
    let calls = 0;
    const fakeFetch = mock.method(globalThis, 'fetch', async () =>
      (++calls < 3 ? respond(503, { error: { message: 'high demand' } }) : success())
    );
    const result = await gemini().classify(REQUEST);
    assert.equal(result.categoryKey, 'metal');
    assert.deepEqual(requestedModels(fakeFetch), ['main-model', 'gemini-flash-latest', 'gemini-flash-lite-latest']);
  });

  test('if Google rejects the key, it does not insist with other models', async () => {
    const fakeFetch = mock.method(globalThis, 'fetch', async () => respond(400, { error: { message: 'API key not valid' } }));
    await assert.rejects(gemini().classify(REQUEST), /400/);
    assert.equal(fakeFetch.mock.callCount(), 1);
  });

  test('a response without text counts as a failure and tries the next model', async () => {
    let calls = 0;
    const fakeFetch = mock.method(globalThis, 'fetch', async () =>
      (++calls === 1 ? respond(200, { candidates: [] }) : success())
    );
    assert.equal((await gemini().classify(REQUEST)).categoryKey, 'metal');
    assert.equal(fakeFetch.mock.callCount(), 2);
  });
});

describe('common functions', () => {
  test('extractImage only accepts allowed formats', () => {
    assert.deepEqual(extractImage(IMAGE), { mimeType: 'image/jpeg', data: 'AAAA' });
    assert.equal(extractImage('data:image/gif;base64,AAAA'), null);
    assert.equal(extractImage(123), null);
  });

  test('parseResult limits confidence between 0 and 1', () => {
    assert.equal(parseResult('{"category":"metal","confidence":1.7}', KEYS).confidence, 1);
    assert.equal(parseResult('{"category":"metal","confidence":-2}', KEYS).confidence, 0);
    assert.equal(parseResult('{"category":"metal","confidence":"x"}', KEYS).confidence, 0);
  });

  test('parseResult rejects unknown categories and empty responses', () => {
    assert.throws(() => parseResult('{"category":"gold","confidence":1}', KEYS), /unknown category/);
    assert.throws(() => parseResult(undefined, KEYS), /no response/);
  });
});
