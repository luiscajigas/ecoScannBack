const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startApi, USER, SCAN, JWT_SECRET } = require('./support');

const IMAGE = 'data:image/jpeg;base64,AAAA';

describe('authentication', () => {
  let api;
  beforeEach(async () => { api = await startApi(); });
  afterEach(() => api.close());

  const register = (data = USER) => api.request('/auth/register', { method: 'POST', body: data });

  test('registering returns a token and never the hash', async () => {
    const { status, json } = await register();
    assert.equal(status, 201);
    assert.ok(json.token);
    assert.equal(json.user.email, USER.email);
    assert.equal(JSON.stringify(json).includes('passwordHash'), false);
  });

  test('a repeated email responds 409 EMAIL_IN_USE', async () => {
    await register();
    const { status, json } = await register();
    assert.equal(status, 409);
    assert.equal(json.code, 'EMAIL_IN_USE');
  });

  for (const [scenario, data] of [
    ['an invalid email', { ...USER, email: 'not-an-email' }],
    ['a short password', { ...USER, password: '123' }],
    ['an empty name', { ...USER, name: '' }],
    ['a missing field', { email: USER.email, password: USER.password }],
    ['an extra field', { ...USER, admin: true }],
    ['a non-text password', { ...USER, password: 12345678 }]
  ]) {
    test(`the contract rejects registering with ${scenario}`, async () => {
      const { status, json } = await register(data);
      assert.equal(status, 400);
      assert.equal(json.code, 'INVALID_DATA');
    });
  }

  test('correct login and wrong credentials', async () => {
    await register();
    const good = await api.request('/auth/login', { method: 'POST', body: { email: USER.email, password: USER.password } });
    assert.equal(good.status, 200);
    assert.ok(good.json.token);

    const bad = await api.request('/auth/login', { method: 'POST', body: { email: USER.email, password: 'wrong-password' } });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.code, 'INVALID_CREDENTIALS');
  });

  test('a request without a body responds 400', async () => {
    const { status, json } = await api.request('/auth/login', { method: 'POST' });
    assert.equal(status, 400);
    assert.equal(json.code, 'INVALID_DATA');
  });

  test('broken JSON responds 400 in the contract format', async () => {
    const { status, json } = await api.request('/auth/login', { method: 'POST', body: '{broken' });
    assert.equal(status, 400);
    assert.equal(json.code, 'INVALID_DATA');
  });
});

describe('attempt limit', () => {
  test('blocks after many failed attempts', async () => {
    const api = await startApi({ maxAuthAttempts: 2 });
    try {
      const attempt = () => api.request('/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' } });
      assert.equal((await attempt()).status, 401);
      assert.equal((await attempt()).status, 401);
      const blocked = await attempt();
      assert.equal(blocked.status, 429);
      assert.equal(blocked.json.code, 'TOO_MANY_ATTEMPTS');
    } finally {
      await api.close();
    }
  });
});

describe('protected routes', () => {
  let api;
  let token;
  before(async () => {
    api = await startApi();
    token = (await api.request('/auth/register', { method: 'POST', body: USER })).json.token;
  });
  after(() => api.close());

  for (const [method, route] of [['GET', '/users/me'], ['GET', '/scans'], ['POST', '/scans']]) {
    test(`${method} ${route} without a token responds 401 NOT_AUTHENTICATED`, async () => {
      const { status, json } = await api.request(route, { method, body: method === 'POST' ? SCAN : undefined });
      assert.equal(status, 401);
      assert.equal(json.code, 'NOT_AUTHENTICATED');
    });
  }

  test('a fake token responds 401 INVALID_TOKEN', async () => {
    const { status, json } = await api.request('/scans', { token: 'fake' });
    assert.equal(status, 401);
    assert.equal(json.code, 'INVALID_TOKEN');
  });

  test('a correctly signed token with another shape responds 401 INVALID_TOKEN', async () => {
    const otherToken = jwt.sign({ subject: 1 }, JWT_SECRET, { algorithm: 'HS256' });
    const { status, json } = await api.request('/scans', { token: otherToken });
    assert.equal(status, 401);
    assert.equal(json.code, 'INVALID_TOKEN');
  });

  test('the profile returns the user without private data', async () => {
    const { status, json } = await api.request('/users/me', { token });
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(json).sort(), ['email', 'id', 'name', 'points']);
  });

  test('a category outside the contract responds 400', async () => {
    const { status } = await api.request('/scans', { method: 'POST', token, body: { ...SCAN, categoryKey: 'cardboard' } });
    assert.equal(status, 400);
  });

  test('an out-of-range confidence responds 400', async () => {
    const { status } = await api.request('/scans', { method: 'POST', token, body: { ...SCAN, confidence: 7 } });
    assert.equal(status, 400);
  });
});

describe('scans', () => {
  async function withUser(options) {
    const api = await startApi(options);
    const { json } = await api.request('/auth/register', { method: 'POST', body: USER });
    return { api, token: json.token };
  }

  test('without AI it uses the heuristic and adds the points', async () => {
    const { api, token } = await withUser();
    try {
      const { status, json } = await api.request('/scans', { method: 'POST', token, body: SCAN });
      assert.equal(status, 201);
      assert.equal(json.source, 'heuristic');
      assert.equal(json.category.key, 'plastic');
      assert.equal(json.totalPoints, 15);

      const history = await api.request('/scans', { token });
      assert.equal(history.status, 200);
      assert.equal(history.json.length, 1);
    } finally {
      await api.close();
    }
  });

  test('with AI, its classification replaces the heuristic', async () => {
    const classifier = { isAvailable: true, classify: async () => ({ categoryKey: 'metal', confidence: 0.9 }) };
    const { api, token } = await withUser({ classifier });
    try {
      const { json } = await api.request('/scans', { method: 'POST', token, body: { ...SCAN, imageBase64: IMAGE } });
      assert.equal(json.source, 'ai');
      assert.equal(json.category.key, 'metal');
      assert.equal(json.confidence, 0.9);
    } finally {
      await api.close();
    }
  });

  test('if AI fails, it still responds with the heuristic', async () => {
    const classifier = { isAvailable: true, classify: async () => { throw new Error('overloaded'); } };
    const { api, token } = await withUser({ classifier });
    try {
      const { status, json } = await api.request('/scans', { method: 'POST', token, body: { ...SCAN, imageBase64: IMAGE } });
      assert.equal(status, 201);
      assert.equal(json.source, 'heuristic');
    } finally {
      await api.close();
    }
  });
});

describe('history and statistics', () => {
  const THUMBNAIL = 'data:image/jpeg;base64,AAAA';
  let api;
  let token;

  beforeEach(async () => {
    api = await startApi();
    token = (await api.request('/auth/register', { method: 'POST', body: USER })).json.token;
    for (const categoryKey of ['plastic', 'metal', 'plastic']) {
      await api.request('/scans', { method: 'POST', token, body: { ...SCAN, categoryKey, thumbnailBase64: THUMBNAIL } });
    }
  });
  afterEach(() => api.close());

  test('the history is paginated with the newest first', async () => {
    const first = await api.request('/scans?limit=2', { token });
    const second = await api.request('/scans?limit=2&offset=2', { token });
    assert.deepEqual(first.json.map((s) => s.id), [3, 2]);
    assert.deepEqual(second.json.map((s) => s.id), [1]);
  });

  test('the history is filtered by category', async () => {
    const { json } = await api.request('/scans?category=metal', { token });
    assert.equal(json.length, 1);
    assert.equal(json[0].categoryKey, 'metal');
  });

  test('the history includes the thumbnail', async () => {
    const { json } = await api.request('/scans', { token });
    assert.equal(json[0].thumbnail, THUMBNAIL);
  });

  for (const query of ['limit=0', 'limit=51', 'offset=-1', 'category=gold', 'other=1']) {
    test(`the contract rejects the query ${query}`, async () => {
      const { status, json } = await api.request(`/scans?${query}`, { token });
      assert.equal(status, 400);
      assert.equal(json.code, 'INVALID_DATA');
    });
  }

  test('a thumbnail that is not a JPEG data URL is rejected', async () => {
    const { status } = await api.request('/scans', { method: 'POST', token, body: { ...SCAN, thumbnailBase64: 'https://evil.example.com/x.png' } });
    assert.equal(status, 400);
  });

  test('a thumbnail that is too large is rejected', async () => {
    const thumbnailBase64 = `data:image/jpeg;base64,${'A'.repeat(30000)}`;
    const { status } = await api.request('/scans', { method: 'POST', token, body: { ...SCAN, thumbnailBase64 } });
    assert.equal(status, 400);
  });

  test('the statistics follow the contract', async () => {
    const { status, json } = await api.request('/users/me/stats?timeZone=America/Bogota', { token });
    assert.equal(status, 200);
    assert.equal(json.totalScans, 3);
    assert.equal(json.lastSevenDays.length, 7);
    assert.deepEqual(json.byCategory.map((c) => c.count).sort(), [1, 2]);
  });

  test('an unknown time zone responds 400', async () => {
    const { status, json } = await api.request('/users/me/stats?timeZone=Mars/Olympus', { token });
    assert.equal(status, 400);
    assert.equal(json.code, 'INVALID_DATA');
  });

  test('the statistics require a session', async () => {
    assert.equal((await api.request('/users/me/stats')).status, 401);
  });
});

describe('health, routes and CORS', () => {
  test('health reports whether the database responds', async () => {
    const healthy = await startApi();
    const down = await startApi({ checkDatabase: async () => { throw new Error('down'); } });
    try {
      assert.equal((await healthy.request('/health')).json.database, 'connected');
      const response = await down.request('/health');
      assert.equal(response.status, 503);
      assert.equal(response.json.database, 'disconnected');
    } finally {
      await healthy.close();
      await down.close();
    }
  });

  test('categories are public', async () => {
    const api = await startApi();
    try {
      const { status, json } = await api.request('/categories');
      assert.equal(status, 200);
      assert.equal(json.length, 3);
    } finally {
      await api.close();
    }
  });

  test('an unknown route responds 404 ROUTE_NOT_FOUND', async () => {
    const api = await startApi();
    try {
      const { status, json } = await api.request('/does-not-exist');
      assert.equal(status, 404);
      assert.equal(json.code, 'ROUTE_NOT_FOUND');
    } finally {
      await api.close();
    }
  });

  for (const [origin, isAllowed] of [
    ['https://eco-scann-fron.vercel.app', true],
    ['https://eco-scann-fron-n4wlsrp0r-luiscajigas-projects.vercel.app', true],
    ['https://eco-scann-fron-fake.vercel.app', false],
    ['https://bad.example.com', false],
    ['http://localhost:4200', false]
  ]) {
    test(`CORS in production ${isAllowed ? 'allows' : 'rejects'} ${origin}`, async () => {
      const api = await startApi();
      try {
        const { headers } = await api.request('/health', { headers: { Origin: origin } });
        assert.equal(headers.get('access-control-allow-origin'), isAllowed ? origin : null);
      } finally {
        await api.close();
      }
    });
  }

  test('CORS allows localhost outside production', async () => {
    const api = await startApi({ isProduction: false });
    try {
      const { headers } = await api.request('/health', { headers: { Origin: 'http://localhost:4200' } });
      assert.equal(headers.get('access-control-allow-origin'), 'http://localhost:4200');
    } finally {
      await api.close();
    }
  });
});
