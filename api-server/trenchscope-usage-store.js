const fs = require('fs');
const path = require('path');

const DEFAULT_ENDPOINT_KEYS = [
  'token_overview',
  'token_security',
  'holder_distribution',
  'wallet_pnl',
  'wallet_portfolio',
  'trending',
];

const DEFAULT_STORE_FILE_PATH = path.join(__dirname, 'data', 'trenchscope-usage.json');

function createDefaultEndpoints() {
  return DEFAULT_ENDPOINT_KEYS.reduce((endpoints, endpointKey) => {
    endpoints[endpointKey] = 0;
    return endpoints;
  }, {});
}

function createUsageStore(options = {}) {
  const storeFilePath = options.storeFilePath || DEFAULT_STORE_FILE_PATH;
  const now = options.now || (() => new Date().toISOString());

  function ensureParentDirExists() {
    fs.mkdirSync(path.dirname(storeFilePath), { recursive: true });
  }

  function writeStore(store) {
    ensureParentDirExists();
    fs.writeFileSync(storeFilePath, JSON.stringify(store, null, 2));
    return store;
  }

  function createInitialStore() {
    const timestamp = now();

    return {
      totalCalls: 0,
      endpoints: createDefaultEndpoints(),
      since: timestamp,
      lastUpdatedAt: timestamp,
    };
  }

  function readStore() {
    ensureParentDirExists();

    if (!fs.existsSync(storeFilePath)) {
      return writeStore(createInitialStore());
    }

    const parsedStore = JSON.parse(fs.readFileSync(storeFilePath, 'utf8'));

    return {
      totalCalls: parsedStore.totalCalls || 0,
      endpoints: {
        ...createDefaultEndpoints(),
        ...(parsedStore.endpoints || {}),
      },
      since: parsedStore.since || now(),
      lastUpdatedAt: parsedStore.lastUpdatedAt || parsedStore.since || now(),
    };
  }

  function recordAttempt(endpointKey) {
    const currentStore = readStore();
    const updatedStore = {
      ...currentStore,
      totalCalls: currentStore.totalCalls + 1,
      endpoints: {
        ...currentStore.endpoints,
        [endpointKey]: (currentStore.endpoints[endpointKey] || 0) + 1,
      },
      lastUpdatedAt: now(),
    };

    return writeStore(updatedStore);
  }

  function getSummary() {
    return readStore();
  }

  return {
    getSummary,
    recordAttempt,
  };
}

module.exports = {
  DEFAULT_ENDPOINT_KEYS,
  DEFAULT_STORE_FILE_PATH,
  createUsageStore,
};
