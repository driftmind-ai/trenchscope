const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createUsageStore } = require('./trenchscope-usage-store');
const { readEnvValueFromFile } = require('./trenchscope-env');

const OFFICIAL_BIRDEYE_BASE_URL = 'https://public-api.birdeye.so';

test('adapter returns API_KEY_MISSING before any upstream request', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  let httpClientCalled = false;
  let usageStoreCalled = false;
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async () => {
        httpClientCalled = true;
        throw new Error('httpClient.get should not be called');
      },
    },
    getApiKey: () => '',
    usageStore: {
      getSummary: () => ({ totalCalls: 0, endpoints: { trending: 0 } }),
      recordAttempt: () => {
        usageStoreCalled = true;
        throw new Error('usageStore.recordAttempt should not be called');
      },
    },
  });

  const result = await adapter.getTrending();

  assert.deepEqual(result, {
    success: false,
    error: {
      code: 'API_KEY_MISSING',
      message: 'Set BIRDEYE_API_KEY in your .env file',
    },
  });
  assert.equal(httpClientCalled, false);
  assert.equal(usageStoreCalled, false);
});

test('createTrenchScopeAdapter uses a custom Birdeye base URL', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const requestedUrls = [];
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        requestedUrls.push(url);

        return {
          data: {
            data: {
              items: [],
            },
          },
        };
      },
    },
    getApiKey: () => 'birdeye-key',
    getBaseUrl: () => 'https://proxy.example.com/base',
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({ totalCalls: 1, endpoints: { trending: 1 } }),
    },
  });

  const result = await adapter.getTrending();

  assert.equal(result.success, true);
  assert.deepEqual(requestedUrls, ['https://proxy.example.com/base/defi/v3/token/meme/list']);
});

test('createTrenchScopeAdapter resolves the base URL per request', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const requestedUrls = [];
  let baseUrlCalls = 0;
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        requestedUrls.push(url);

        return {
          data: {
            data: {
              items: [],
            },
          },
        };
      },
    },
    getApiKey: () => 'birdeye-key',
    getBaseUrl: () => {
      baseUrlCalls += 1;
      return baseUrlCalls === 1
        ? 'https://proxy.example.com/first/'
        : '  https://proxy.example.com/second  ';
    },
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({ totalCalls: 2, endpoints: { trending: 2 } }),
    },
  });

  const firstResult = await adapter.getTrending();
  const secondResult = await adapter.getTrending();

  assert.equal(firstResult.success, true);
  assert.equal(secondResult.success, true);
  assert.deepEqual(requestedUrls, [
    'https://proxy.example.com/first/defi/v3/token/meme/list',
    'https://proxy.example.com/second/defi/v3/token/meme/list',
  ]);
});

test('normalizeBaseUrl trims whitespace and removes one trailing slash', () => {
  const { normalizeBaseUrl } = require('./trenchscope-adapter');

  assert.equal(normalizeBaseUrl('  https://proxy.example.com/base/  '), 'https://proxy.example.com/base');
  assert.equal(normalizeBaseUrl('   '), 'https://public-api.birdeye.so');
});

test('createTrenchScopeAdapter keeps the fixed request headers', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  let capturedHeaders = null;
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url, config = {}) => {
        capturedHeaders = config.headers;
        return {
          data: {
            data: {
              items: [],
            },
          },
        };
      },
    },
    getApiKey: () => 'birdeye-key',
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({ totalCalls: 1, endpoints: { trending: 1 } }),
    },
  });

  const result = await adapter.getTrending();

  assert.equal(result.success, true);
  assert.deepEqual(capturedHeaders, {
    'X-API-KEY': 'birdeye-key',
    'x-chain': 'solana',
    Accept: 'application/json',
  });
});
test('getToken returns thinly normalized token data and increments three endpoint counters', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trenchscope-token-'));
  const usageStore = createUsageStore({
    storeFilePath: path.join(tempDir, 'usage.json'),
    now: () => '2026-04-17T12:34:56.000Z',
  });
  const upstreamCalls = [];

  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        upstreamCalls.push(url);

        if (url.includes('/defi/token_overview')) {
          return {
            data: {
              data: {
                name: 'Bonk',
                symbol: 'BONK',
                price: '0.000021',
                mc: '123456789',
                liquidity: '987654',
                v24hUSD: '543210',
                holder: '654321',
                logoURI: 'https://img.example/bonk.png',
              },
            },
          };
        }

        if (url.includes('/defi/token_security')) {
          return {
            data: {
              data: {
                creatorAddress: 'creator-wallet',
              },
            },
          };
        }

        if (url.includes('/defi/v3/token/holder')) {
          return {
            data: {
              data: {
                top10HolderPercent: '12.5',
                items: [
                  {
                    owner: 'wallet-1',
                    amount: '1000',
                    percentage: '4.2',
                  },
                  {
                    owner: 'wallet-2',
                    amount: '500',
                    percentage: '2.1',
                  },
                ],
              },
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    usageStore,
  });

  const result = await adapter.getToken('mint-123');

  assert.equal(result.success, true);
  assert.equal(result.data.address, 'mint-123');
  assert.deepEqual(result.data.overview, {
    name: 'Bonk',
    symbol: 'BONK',
    price: 0.000021,
    marketCap: 123456789,
    liquidity: 987654,
    volume24h: 543210,
    holderCount: 654321,
    logoUri: 'https://img.example/bonk.png',
  });
  assert.deepEqual(result.data.security, {
    creatorAddress: 'creator-wallet',
    freezeAuthority: null,
    mintAuthority: null,
    riskSummary: null,
    rawFlags: {
      hasFreezeAuthority: false,
      hasMintAuthority: false,
    },
  });
  assert.equal(result.data.chart.embedUrl.includes('mint-123'), true);
  assert.deepEqual(result.data.holderDistribution, {
    top10Percent: 12.5,
    items: [
      {
        owner: 'wallet-1',
        amount: 1000,
        percentage: 4.2,
      },
      {
        owner: 'wallet-2',
        amount: 500,
        percentage: 2.1,
      },
    ],
  });
  assert.equal(result.meta.source, 'birdeye');
  assert.deepEqual(usageStore.getSummary().endpoints, {
    token_overview: 1,
    token_security: 1,
    holder_distribution: 1,
    wallet_pnl: 0,
    wallet_portfolio: 0,
    trending: 0,
  });
  assert.equal(upstreamCalls.length, 3);
});

test('getToken derives holder share and top 10 concentration from security and ui amounts', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        if (url.includes('/defi/token_overview')) {
          return {
            data: {
              data: {
                name: 'USD Coin',
                symbol: 'USDC',
                totalSupply: '1000',
              },
            },
          };
        }

        if (url.includes('/defi/token_security')) {
          return {
            data: {
              data: {
                creatorAddress: 'creator-wallet',
                freezeAuthority: 'freeze-wallet',
                top10HolderPercent: '0.5',
                totalSupply: '1000',
              },
            },
          };
        }

        if (url.includes('/defi/v3/token/holder')) {
          return {
            data: {
              data: {
                items: [
                  {
                    owner: 'wallet-1',
                    amount: '400000000',
                    ui_amount: '400',
                    decimals: 6,
                  },
                  {
                    owner: 'wallet-2',
                    amount: '100000000',
                    ui_amount: '100',
                    decimals: 6,
                  },
                ],
              },
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({
        totalCalls: 3,
        endpoints: {
          token_overview: 1,
          token_security: 1,
          holder_distribution: 1,
        },
      }),
    },
  });

  const result = await adapter.getToken('mint-derive');

  assert.equal(result.success, true);
  assert.equal(result.data.holderDistribution.top10Percent, 50);
  assert.deepEqual(result.data.holderDistribution.items, [
    {
      owner: 'wallet-1',
      amount: 400,
      percentage: 40,
    },
    {
      owner: 'wallet-2',
      amount: 100,
      percentage: 10,
    },
  ]);
  assert.equal(result.data.security.freezeAuthority, 'freeze-wallet');
});

test('getToken normalizes top 10 concentration fractions with floating point drift around one', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        if (url.includes('/defi/token_overview')) {
          return {
            data: {
              data: {
                name: 'PRCY',
                symbol: 'PRCY',
              },
            },
          };
        }

        if (url.includes('/defi/token_security')) {
          return {
            data: {
              data: {
                top10HolderPercent: '1.0000000000000002',
              },
            },
          };
        }

        if (url.includes('/defi/v3/token/holder')) {
          return {
            data: {
              data: {
                items: [],
              },
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({
        totalCalls: 3,
        endpoints: {
          token_overview: 1,
          token_security: 1,
          holder_distribution: 1,
        },
      }),
    },
  });

  const result = await adapter.getToken('mint-edge');

  assert.equal(result.success, true);
  assert.equal(result.data.holderDistribution.top10Percent, 100.00000000000003);
});

test('getToken keeps overview and holders when token security is permission-blocked', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const callOrder = [];
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        callOrder.push(url);

        if (url.includes('/defi/token_overview')) {
          return {
            data: {
              data: {
                name: 'Bonk',
                symbol: 'BONK',
                price: '0.000021',
              },
            },
          };
        }

        if (url.includes('/defi/token_security')) {
          const error = new Error('Forbidden');
          error.response = {
            status: 401,
            data: {
              success: false,
              message: 'Your API key lacks sufficient permissions to access this resource.',
            },
          };
          throw error;
        }

        if (url.includes('/defi/v3/token/holder')) {
          return {
            data: {
              data: {
                top10HolderPercent: '12.5',
                items: [],
              },
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    getBaseUrl: () => OFFICIAL_BIRDEYE_BASE_URL,
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({
        totalCalls: 3,
        endpoints: {
          token_overview: 1,
          token_security: 1,
          holder_distribution: 1,
        },
      }),
    },
  });

  const result = await adapter.getToken('mint-123');

  assert.deepEqual(callOrder, [
    `${OFFICIAL_BIRDEYE_BASE_URL}/defi/token_overview`,
    `${OFFICIAL_BIRDEYE_BASE_URL}/defi/v3/token/holder`,
    `${OFFICIAL_BIRDEYE_BASE_URL}/defi/token_security`,
  ]);
  assert.equal(result.success, true);
  assert.deepEqual(result.data.overview, {
    name: 'Bonk',
    symbol: 'BONK',
    price: 0.000021,
    marketCap: null,
    liquidity: null,
    volume24h: null,
    holderCount: null,
    logoUri: null,
  });
  assert.equal(result.data.security, null);
  assert.deepEqual(result.data.holderDistribution, {
    top10Percent: 12.5,
    items: [],
  });
  assert.deepEqual(result.meta, {
    source: 'birdeye',
    warnings: [
      {
        code: 'TOKEN_SECURITY_UNAVAILABLE',
        message: 'Token security data is currently unavailable from Birdeye.',
        status: 401,
      },
    ],
  });
});

test('getWallet retries once on 429 using Retry-After before succeeding', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const sleepCalls = [];
  let portfolioAttempts = 0;
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        if (url.includes('/wallet/v2/current-net-worth')) {
          portfolioAttempts += 1;

          if (portfolioAttempts === 1) {
            const error = new Error('Rate limited');
            error.response = {
              status: 429,
              headers: {
                'retry-after': '2',
              },
            };
            throw error;
          }

          return {
            data: {
              data: {
                total_value: '4567.89',
                items: [],
              },
            },
          };
        }

        if (url.includes('/wallet/v2/pnl/summary')) {
          return {
            data: {
              data: {
                totalPnlUsd: '1234.56',
              },
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({
        totalCalls: 3,
        endpoints: {
          wallet_pnl: 1,
          wallet_portfolio: 2,
        },
      }),
    },
  });

  const result = await adapter.getWallet('wallet-123');

  assert.equal(result.success, true);
  assert.equal(portfolioAttempts, 2);
  assert.deepEqual(sleepCalls, [2000]);
});

test('getWallet retries once on 429 with a 1 second fallback when Retry-After is missing', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const sleepCalls = [];
  let pnlAttempts = 0;
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        if (url.includes('/wallet/v2/current-net-worth')) {
          return {
            data: {
              data: {
                total_value: '4567.89',
                items: [],
              },
            },
          };
        }

        if (url.includes('/wallet/v2/pnl/summary')) {
          pnlAttempts += 1;

          if (pnlAttempts === 1) {
            const error = new Error('Rate limited');
            error.response = {
              status: 429,
              headers: {},
            };
            throw error;
          }

          return {
            data: {
              data: {
                totalPnlUsd: '1234.56',
              },
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({
        totalCalls: 3,
        endpoints: {
          wallet_pnl: 2,
          wallet_portfolio: 1,
        },
      }),
    },
  });

  const result = await adapter.getWallet('wallet-123');

  assert.equal(result.success, true);
  assert.equal(pnlAttempts, 2);
  assert.deepEqual(sleepCalls, [1000]);
});

test('getTrending maps Birdeye field names without inventing extra analytics', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        assert.equal(url, `${OFFICIAL_BIRDEYE_BASE_URL}/defi/v3/token/meme/list`);

        return {
          data: {
            data: {
              items: [
                {
                  address: 'mint-abc',
                  name: 'Bonk',
                  symbol: 'BONK',
                  price: '0.000021',
                  price24hChangePercent: '-3.5',
                  volume24hUSD: '543210',
                  mc: '123456789',
                  logoURI: 'https://img.example/bonk.png',
                  extraSourceField: 'should-not-be-forwarded',
                },
              ],
            },
          },
        };
      },
    },
    getApiKey: () => 'birdeye-key',
    getBaseUrl: () => OFFICIAL_BIRDEYE_BASE_URL,
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({ totalCalls: 1, endpoints: { trending: 1 } }),
    },
  });

  const result = await adapter.getTrending();

  assert.deepEqual(result, {
    success: true,
    data: {
      items: [
        {
          address: 'mint-abc',
          name: 'Bonk',
          symbol: 'BONK',
          price: 0.000021,
          change24hPercent: -3.5,
          volume24hUsd: 543210,
          marketCap: 123456789,
          logoUri: 'https://img.example/bonk.png',
        },
      ],
    },
    meta: {
      source: 'birdeye',
      refreshSeconds: 30,
    },
  });
});

test('getTrending maps snake_case Birdeye momentum fields from meme list', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async () => ({
        data: {
          data: {
            items: [
              {
                address: 'mint-snake',
                name: 'Irys',
                symbol: 'IRYS',
                price: '0.010388',
                price_change_24h_percent: '12.5',
                volume_24h_usd: '98765.43',
                market_cap: '10388365.70',
                logo_uri: 'https://img.example/irys.png',
              },
            ],
          },
        },
      }),
    },
    getApiKey: () => 'birdeye-key',
    getBaseUrl: () => OFFICIAL_BIRDEYE_BASE_URL,
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({ totalCalls: 1, endpoints: { trending: 1 } }),
    },
  });

  const result = await adapter.getTrending();

  assert.deepEqual(result.data.items[0], {
    address: 'mint-snake',
    name: 'Irys',
    symbol: 'IRYS',
    price: 0.010388,
    change24hPercent: 12.5,
    volume24hUsd: 98765.43,
    marketCap: 10388365.70,
    logoUri: 'https://img.example/irys.png',
  });
});

test('getWallet returns API_KEY_MISSING before any upstream request', async () => {
  const { createTrenchScopeAdapter, missingKeyPayload } = require('./trenchscope-adapter');
  let httpClientCalled = false;
  let usageStoreCalled = false;
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async () => {
        httpClientCalled = true;
        throw new Error('httpClient.get should not be called');
      },
    },
    getApiKey: () => '',
    usageStore: {
      getSummary: () => ({ totalCalls: 0, endpoints: { wallet_pnl: 0, wallet_portfolio: 0 } }),
      recordAttempt: () => {
        usageStoreCalled = true;
        throw new Error('usageStore.recordAttempt should not be called');
      },
    },
  });

  const result = await adapter.getWallet('wallet-123');

  assert.deepEqual(result, missingKeyPayload);
  assert.equal(httpClientCalled, false);
  assert.equal(usageStoreCalled, false);
});

test('getWallet returns WALLET_LOOKUP_FAILED when an upstream wallet request fails', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        if (url.includes('/wallet/v2/pnl/summary')) {
          throw new Error('Birdeye wallet pnl request failed');
        }

        if (url.includes('/wallet/v2/current-net-worth')) {
          return {
            data: {
              data: {
                total_value: '4567.89',
                items: [],
              },
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({
        totalCalls: 2,
        endpoints: {
          wallet_pnl: 1,
          wallet_portfolio: 1,
        },
      }),
    },
  });

  const result = await adapter.getWallet('wallet-123');

  assert.deepEqual(result, {
    success: false,
    error: {
      code: 'WALLET_LOOKUP_FAILED',
      message: 'Unable to load wallet data from Birdeye',
    },
  });
});

test('getWallet returns best-effort wallet data with null fallbacks', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const upstreamCalls = [];
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url, config = {}) => {
        upstreamCalls.push({ url, params: config.params });

        if (url.includes('/wallet/v2/current-net-worth')) {
          return {
            data: {
              data: {
                total_value: '4567.89',
                items: [
                  {
                    address: 'mint-1',
                    symbol: 'TOK',
                    value: '1200.5',
                    amount: '12345.67',
                  },
                ],
              },
            },
          };
        }

        if (url.includes('/wallet/v2/pnl/summary')) {
          return {
            data: {
              data: {
                totalPnlUsd: '1234.56',
                winRate: '62.5',
              },
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    getBaseUrl: () => OFFICIAL_BIRDEYE_BASE_URL,
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({
        totalCalls: 2,
        endpoints: {
          wallet_pnl: 1,
          wallet_portfolio: 1,
        },
      }),
    },
  });

  const result = await adapter.getWallet('wallet-123');

  assert.deepEqual(result, {
    success: true,
    data: {
      wallet: 'wallet-123',
      pnl: {
        totalPnlUsd: 1234.56,
        winRate: 62.5,
        realizedPnlUsd: null,
        unrealizedPnlUsd: null,
      },
      portfolio: {
        totalValueUsd: 4567.89,
        itemCount: 1,
        items: [
          {
            address: 'mint-1',
            symbol: 'TOK',
            valueUsd: 1200.5,
            amount: 12345.67,
          },
        ],
      },
    },
    meta: { source: 'birdeye' },
  });

  assert.deepEqual(upstreamCalls, [
    {
      url: `${OFFICIAL_BIRDEYE_BASE_URL}/wallet/v2/current-net-worth`,
      params: {
        wallet: 'wallet-123',
        sort_by: 'value',
        sort_type: 'desc',
        limit: 20,
      },
    },
    {
      url: `${OFFICIAL_BIRDEYE_BASE_URL}/wallet/v2/pnl/summary`,
      params: { wallet: 'wallet-123' },
    },
  ]);
});

test('getWallet maps Birdeye pnl summary nested under wallet address', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const wallet = 'wallet-123';
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        if (url.includes('/wallet/v2/current-net-worth')) {
          return {
            data: {
              data: {
                total_value: '4567.89',
                items: [],
              },
            },
          };
        }

        if (url.includes('/wallet/v2/pnl/summary')) {
          return {
            data: {
              data: {
                [wallet]: {
                  pnl: {
                    total_usd: '-2.63',
                    realized_profit_usd: '0',
                    unrealized_usd: '-2.63',
                    win_percent: '66.7',
                  },
                },
              },
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    getBaseUrl: () => OFFICIAL_BIRDEYE_BASE_URL,
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({
        totalCalls: 2,
        endpoints: {
          wallet_pnl: 1,
          wallet_portfolio: 1,
        },
      }),
    },
  });

  const result = await adapter.getWallet(wallet);

  assert.deepEqual(result, {
    success: true,
    data: {
      wallet,
      pnl: {
        totalPnlUsd: -2.63,
        winRate: 66.7,
        realizedPnlUsd: 0,
        unrealizedPnlUsd: -2.63,
      },
      portfolio: {
        totalValueUsd: 4567.89,
        itemCount: 0,
        items: [],
      },
    },
    meta: { source: 'birdeye' },
  });
});

test('getWallet maps one-balance summary counts win_rate and pnl totals', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const wallet = 'wallet-123';
  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: async (url) => {
        if (url.includes('/wallet/v2/current-net-worth')) {
          return {
            data: {
              data: {
                total_value: '8327.55',
                items: [],
              },
            },
          };
        }

        if (url.includes('/wallet/v2/pnl/summary')) {
          return {
            data: {
              data: {
                summary: {
                  counts: {
                    win_rate: '0.2636268343815514',
                  },
                  pnl: {
                    total_usd: '2868022.429053033',
                    realized_profit_usd: '3055877.8995937877',
                    unrealized_usd: '-187855.47054075473',
                  },
                },
              },
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    getBaseUrl: () => OFFICIAL_BIRDEYE_BASE_URL,
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({
        totalCalls: 2,
        endpoints: {
          wallet_pnl: 1,
          wallet_portfolio: 1,
        },
      }),
    },
  });

  const result = await adapter.getWallet(wallet);

  assert.deepEqual(result, {
    success: true,
    data: {
      wallet,
      pnl: {
        totalPnlUsd: 2868022.429053033,
        winRate: 26.362683438155138,
        realizedPnlUsd: 3055877.8995937877,
        unrealizedPnlUsd: -187855.47054075473,
      },
      portfolio: {
        totalValueUsd: 8327.55,
        itemCount: 0,
        items: [],
      },
    },
    meta: { source: 'birdeye' },
  });
});

 test('getWallet waits for portfolio before requesting pnl summary', async () => {
  const { createTrenchScopeAdapter } = require('./trenchscope-adapter');
  const callOrder = [];
  let portfolioResolved = false;

  const adapter = createTrenchScopeAdapter({
    httpClient: {
      get: (url) => {
        callOrder.push(url);

        if (url.includes('/wallet/v2/current-net-worth')) {
          return new Promise((resolve) => {
            setTimeout(() => {
              portfolioResolved = true;
              resolve({
                data: {
                  data: {
                    total_value: '4567.89',
                    items: [],
                  },
                },
              });
            }, 10);
          });
        }

        if (url.includes('/wallet/v2/pnl/summary')) {
          assert.equal(portfolioResolved, true);
          return Promise.resolve({
            data: {
              data: {
                totalPnlUsd: '1234.56',
              },
            },
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    },
    getApiKey: () => 'birdeye-key',
    getBaseUrl: () => OFFICIAL_BIRDEYE_BASE_URL,
    usageStore: {
      recordAttempt: () => {},
      getSummary: () => ({
        totalCalls: 2,
        endpoints: {
          wallet_pnl: 1,
          wallet_portfolio: 1,
        },
      }),
    },
  });

  const result = await adapter.getWallet('wallet-123');

  assert.equal(result.success, true);
  assert.deepEqual(callOrder, [
    `${OFFICIAL_BIRDEYE_BASE_URL}/wallet/v2/current-net-worth`,
    `${OFFICIAL_BIRDEYE_BASE_URL}/wallet/v2/pnl/summary`,
  ]);
});

test('createUsageStore initializes the json file and records attempted calls', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trenchscope-usage-store-'));
  const storeFilePath = path.join(tempDir, 'trenchscope-usage.json');
  const providedTimestamp = '2026-04-17T12:34:56.000Z';
  const usageStore = createUsageStore({
    storeFilePath,
    now: () => providedTimestamp,
  });

  assert.equal(fs.existsSync(storeFilePath), false);

  const initialSummary = usageStore.getSummary();

  assert.equal(fs.existsSync(storeFilePath), true);
  assert.equal(initialSummary.totalCalls, 0);
  assert.equal(initialSummary.endpoints.trending, 0);
  assert.equal(initialSummary.since, providedTimestamp);

  const updatedSummary = usageStore.recordAttempt('trending');

  assert.equal(updatedSummary.totalCalls, 1);
  assert.equal(updatedSummary.endpoints.trending, 1);
  assert.equal(updatedSummary.lastUpdatedAt, providedTimestamp);
});

test('readEnvValueFromFile strips inline comments before trimming and unquoting', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trenchscope-env-'));
  const envFilePath = path.join(tempDir, '.env');

  fs.writeFileSync(
    envFilePath,
    "BIRDEYE_API_KEY=  \"abc123\"   # contest key\nANOTHER_KEY=value\n",
    'utf8'
  );

  const value = readEnvValueFromFile(envFilePath, 'BIRDEYE_API_KEY');

  assert.equal(value, 'abc123');
});

test('getBirdeyeBaseUrl reads BIRDEYE_BASE_URL from .env before process.env', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trenchscope-base-url-'));
  const envFilePath = path.join(tempDir, '.env');

  fs.writeFileSync(
    envFilePath,
    'BIRDEYE_BASE_URL=https://one-balance.enconsun.workers.dev/api/custom-birdeye\n',
    'utf8'
  );

  const { getBirdeyeBaseUrl } = require('./trenchscope-env');

  const value = getBirdeyeBaseUrl({
    envPaths: [envFilePath],
    processEnv: { BIRDEYE_BASE_URL: 'https://public-api.birdeye.so' },
  });

  assert.equal(value, 'https://one-balance.enconsun.workers.dev/api/custom-birdeye');
});

test('getBirdeyeBaseUrl falls back to the official Birdeye API when unset', () => {
  const { getBirdeyeBaseUrl } = require('./trenchscope-env');

  const value = getBirdeyeBaseUrl({
    envPaths: [],
    processEnv: {},
  });

  assert.equal(value, 'https://public-api.birdeye.so');
});
