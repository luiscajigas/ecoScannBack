const { createApp } = require('../app');
const { errors } = require('../errors');
const { createAuthService } = require('../services/auth');
const { createScanService } = require('../services/scans');

const JWT_SECRET = 'x'.repeat(40);

const CATEGORIES = [
  { key: 'plastic', name: 'Plastic', instructions: 'Rinse it.', binColor: 'white', points: 15 },
  { key: 'metal', name: 'Metal', instructions: 'Flatten it.', binColor: 'white', points: 15 },
  { key: 'non_recyclable', name: 'Non-recyclable', instructions: 'Black bin.', binColor: 'black', points: 5 }
];

/** In-memory repositories with the same interface as the real ones. */
function createFakeRepositories() {
  const userList = [];
  const history = [];

  const users = {
    async create({ name, email, passwordHash }) {
      if (userList.some((u) => u.email === email)) throw errors.emailInUse();
      const user = { id: userList.length + 1, name, email, points: 0, passwordHash };
      userList.push(user);
      return { id: user.id, name, email, points: 0 };
    },
    async findWithHashByEmail(email) {
      return userList.find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      const user = userList.find((u) => u.id === id);
      if (!user) return null;
      const { passwordHash: _hash, ...publicData } = user;
      return publicData;
    }
  };

  const categories = { list: async () => CATEGORIES };

  const scans = {
    async listByUser(userId) {
      return history.filter((s) => s.userId === userId).map(({ userId: _id, ...scan }) => scan);
    },
    async create({ userId, categoryKey, confidence, source, points }) {
      const user = userList.find((u) => u.id === userId);
      if (!user) throw errors.invalidToken();
      user.points += points;
      const category = CATEGORIES.find((c) => c.key === categoryKey);
      const id = history.length + 1;
      history.push({
        userId,
        id,
        categoryKey,
        categoryName: category.name,
        instructions: category.instructions,
        binColor: category.binColor,
        confidence,
        source,
        pointsAwarded: points,
        createdAt: new Date().toISOString()
      });
      return { id, totalPoints: user.points };
    }
  };

  return { users, categories, scans };
}

/**
 * Starts the API on a free port with responses validated against the contract:
 * if a handler deviates from the contract, the test fails with a 500.
 */
async function startApi({ classifier, checkDatabase, maxAuthAttempts, isProduction = true, origins } = {}) {
  const repositories = createFakeRepositories();
  const app = createApp({
    origins: origins ?? ['https://eco-scann-fron.vercel.app'],
    isProduction,
    checkDatabase: checkDatabase ?? (async () => {}),
    authService: createAuthService({ users: repositories.users, jwtSecret: JWT_SECRET }),
    scanService: createScanService({
      categories: repositories.categories,
      scans: repositories.scans,
      classifier: classifier ?? { isAvailable: false, classify: async () => { throw new Error('no AI'); } }
    }),
    ...repositories,
    validateResponses: true,
    maxAuthAttempts
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  async function request(route, { method = 'GET', body, token, headers = {} } = {}) {
    const response = await fetch(baseUrl + route, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: typeof body === 'string' ? body : body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, json, headers: response.headers };
  }

  return {
    request,
    close: () => new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    })
  };
}

const USER = { name: 'Ana', email: 'ana@example.com', password: 'secret123' };
const SCAN = { categoryKey: 'plastic', confidence: 0.6, widthPx: 100, heightPx: 80 };

module.exports = { startApi, USER, SCAN, JWT_SECRET };
