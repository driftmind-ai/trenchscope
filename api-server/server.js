const cors = require('cors');
const express = require('express');

const { createTrenchScopeAdapter } = require('./trenchscope-adapter');

function sendAdapterPayload(response, payload, fallbackCode, fallbackMessage) {
  if (payload?.success) {
    response.status(200).json(payload);
    return;
  }

  response.status(502).json(
    payload || {
      success: false,
      error: {
        code: fallbackCode,
        message: fallbackMessage,
      },
    },
  );
}

function createHandler(handler, fallbackCode, fallbackMessage) {
  return async (request, response) => {
    try {
      const payload = await handler(request);
      sendAdapterPayload(response, payload, fallbackCode, fallbackMessage);
    } catch (_error) {
      response.status(502).json({
        success: false,
        error: {
          code: fallbackCode,
          message: fallbackMessage,
        },
      });
    }
  };
}

function createApp({ adapter = createTrenchScopeAdapter() } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_request, response) => {
    response.json({
      success: true,
      data: {
        service: 'trenchscope-api',
        status: 'ok',
      },
    });
  });

  app.get(
    '/api/trenchscope/trending',
    createHandler(
      () => adapter.getTrending(),
      'TRENDING_LOOKUP_FAILED',
      'Unable to load trending data from Birdeye',
    ),
  );

  app.get(
    '/api/trenchscope/token',
    createHandler(
      (request) => adapter.getToken(request.query.address),
      'TOKEN_LOOKUP_FAILED',
      'Unable to load token data from Birdeye',
    ),
  );

  app.get(
    '/api/trenchscope/wallet',
    createHandler(
      (request) => adapter.getWallet(request.query.wallet),
      'WALLET_LOOKUP_FAILED',
      'Unable to load wallet data from Birdeye',
    ),
  );

  app.get('/api/trenchscope/usage', (_request, response) => {
    response.json(adapter.getUsage());
  });

  return app;
}

function startServer({ port = Number(process.env.API_PORT || process.env.PORT || 3001) } = {}) {
  const app = createApp();

  return app.listen(port, () => {
    console.log(`TrenchScope API listening on http://localhost:${port}`);
  });
}

module.exports = {
  createApp,
  startServer,
};

if (require.main === module) {
  startServer();
}
