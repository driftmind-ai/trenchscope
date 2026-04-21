const test = require('node:test');
const assert = require('node:assert/strict');

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('health route reports trenchscope api ready', async () => {
  const { createApp } = require('./server');

  const app = createApp({
    adapter: {
      getTrending: async () => ({ success: true, data: { items: [] } }),
      getToken: async () => ({ success: true, data: {} }),
      getWallet: async () => ({ success: true, data: {} }),
      getUsage: () => ({ success: true, data: { totalCalls: 0, endpoints: {}, since: 'now', lastUpdatedAt: 'now' } }),
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(json, {
      success: true,
      data: {
        service: 'trenchscope-api',
        status: 'ok',
      },
    });
  });
});

test('usage route returns adapter summary', async () => {
  const { createApp } = require('./server');

  const app = createApp({
    adapter: {
      getTrending: async () => ({ success: true, data: { items: [] } }),
      getToken: async () => ({ success: true, data: {} }),
      getWallet: async () => ({ success: true, data: {} }),
      getUsage: () => ({
        success: true,
        data: {
          totalCalls: 12,
          endpoints: { trending: 4 },
          since: '2026-04-21T00:00:00.000Z',
          lastUpdatedAt: '2026-04-21T00:05:00.000Z',
        },
      }),
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/trenchscope/usage`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.totalCalls, 12);
    assert.equal(json.data.endpoints.trending, 4);
  });
});
