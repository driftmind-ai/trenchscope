const axios = require('axios');

const { getBirdeyeApiKey, getBirdeyeBaseUrl } = require('./trenchscope-env');
const { createUsageStore } = require('./trenchscope-usage-store');

const missingKeyPayload = {
  success: false,
  error: {
    code: 'API_KEY_MISSING',
    message: 'Set BIRDEYE_API_KEY in your .env file',
  },
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildChartUrl(address) {
  return `https://birdeye.so/tv-widget/${address}?chain=solana&viewMode=pair&chartInterval=1&chartType=CANDLE&chartTimezone=America%2FLos_Angeles&chartLeftToolbar=show&theme=dark`;
}

function mapHolderItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems.map((item) => ({
    owner: item?.owner ?? null,
    amount: toNumber(item?.amount),
    percentage: toNumber(item?.percentage),
  }));
}

function normalizeBaseUrl(baseUrl) {
  const normalized = (baseUrl || '').trim().replace(/\/$/, '');

  return normalized || 'https://public-api.birdeye.so';
}

function getRetryDelayMs(retryAfterHeader) {
  const retryAfterSeconds = Number(retryAfterHeader);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  const retryAfterTime = Date.parse(retryAfterHeader || '');

  if (Number.isFinite(retryAfterTime)) {
    return Math.max(retryAfterTime - Date.now(), 0);
  }

  return 1000;
}

function createTrenchScopeAdapter({
  httpClient = axios,
  getApiKey = getBirdeyeApiKey,
  getBaseUrl = getBirdeyeBaseUrl,
  usageStore = createUsageStore(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  async function birdeyeGet(endpointKey, route, params = {}) {
    const apiKey = getApiKey();
    const baseUrl = normalizeBaseUrl(getBaseUrl());

    if (!apiKey) {
      return {
        ok: false,
        payload: missingKeyPayload,
      };
    }

    const requestConfig = {
      params,
      headers: {
        'X-API-KEY': apiKey,
        'x-chain': 'solana',
        Accept: 'application/json',
      },
    };

    usageStore.recordAttempt(endpointKey);

    try {
      const response = await httpClient.get(`${baseUrl}${route}`, requestConfig);

      return {
        ok: true,
        data: response.data?.data ?? {},
      };
    } catch (error) {
      const status = error?.response?.status ?? null;

      if (status === 429) {
        const retryAfterHeader = error?.response?.headers?.['retry-after'];
        const retryDelayMs = getRetryDelayMs(retryAfterHeader);

        await sleep(retryDelayMs);
        usageStore.recordAttempt(endpointKey);

        try {
          const retryResponse = await httpClient.get(`${baseUrl}${route}`, requestConfig);

          return {
            ok: true,
            data: retryResponse.data?.data ?? {},
          };
        } catch (retryError) {
          return {
            ok: false,
            error: retryError,
          };
        }
      }

      return {
        ok: false,
        error,
      };
    }
  }

  async function getToken(address) {
    const overviewResult = await birdeyeGet('token_overview', '/defi/token_overview', { address });

    if (!overviewResult.ok) {
      if (overviewResult.payload) {
        return overviewResult.payload;
      }

      return {
        success: false,
        error: {
          code: 'TOKEN_LOOKUP_FAILED',
          message: 'Unable to load token data from Birdeye',
        },
      };
    }

    const holderDistributionResult = await birdeyeGet('holder_distribution', '/defi/v3/token/holder', {
      address,
    });

    if (!holderDistributionResult.ok) {
      if (holderDistributionResult.payload) {
        return holderDistributionResult.payload;
      }

      return {
        success: false,
        error: {
          code: 'TOKEN_LOOKUP_FAILED',
          message: 'Unable to load token data from Birdeye',
        },
      };
    }

    const securityResult = await birdeyeGet('token_security', '/defi/token_security', { address });

    const overview = overviewResult.data || {};
    const holderDistribution = holderDistributionResult.data || {};
    const security = securityResult.ok ? securityResult.data || {} : null;
    const securityStatus = securityResult.error?.response?.status ?? null;
    const warnings = securityResult.ok
      ? []
      : [
        {
          code: 'TOKEN_SECURITY_UNAVAILABLE',
          message: 'Token security data is currently unavailable from Birdeye.',
          ...(securityStatus !== null ? { status: securityStatus } : {}),
        },
      ];

    return {
      success: true,
      data: {
        overview: {
          name: overview.name ?? null,
          symbol: overview.symbol ?? null,
          price: toNumber(overview.price),
          marketCap: toNumber(overview.market_cap ?? overview.marketCap ?? overview.mc),
          liquidity: toNumber(overview.liquidity),
          volume24h: toNumber(overview.volume24h ?? overview.volume24hUSD ?? overview.v24hUSD ?? overview.volume_24h ?? overview.volume_24h_usd),
          holderCount: toNumber(overview.holderCount ?? overview.holder ?? overview.holder_count),
          logoUri: overview.logoUri ?? overview.logoURI ?? overview.logo_uri ?? null,
        },
        security: security
          ? {
            creatorAddress: security.creatorAddress ?? null,
            freezeAuthority: security.freezeAuthority ?? null,
            mintAuthority: security.mintAuthority ?? null,
            riskSummary: security.riskSummary ?? null,
            rawFlags: {
              hasFreezeAuthority: security.freezeAuthority === true,
              hasMintAuthority: security.mintAuthority === true,
            },
          }
          : null,
        holderDistribution: {
          top10Percent: toNumber(
            holderDistribution.top10Percent ??
            holderDistribution.top10HolderPercent ??
            holderDistribution.top10_holder_percent
          ),
          items: mapHolderItems(
            holderDistribution.items ??
            holderDistribution.topHolders ??
            holderDistribution.holders
          ),
        },
        chart: {
          embedUrl: buildChartUrl(address),
        },
      },
      meta: {
        source: 'birdeye',
        ...(warnings.length ? { warnings } : {}),
      },
    };
  }

  async function getWallet(wallet) {
    const portfolioResult = await birdeyeGet('wallet_portfolio', '/wallet/v2/current-net-worth', {
      wallet,
      sort_by: 'value',
      sort_type: 'desc',
      limit: 20,
    });

    if (!portfolioResult.ok) {
      if (portfolioResult.payload) {
        return portfolioResult.payload;
      }

      return {
        success: false,
        error: {
          code: 'WALLET_LOOKUP_FAILED',
          message: 'Unable to load wallet data from Birdeye',
        },
      };
    }

    const pnlResult = await birdeyeGet('wallet_pnl', '/wallet/v2/pnl/summary', { wallet });

    if (!pnlResult.ok) {
      if (pnlResult.payload) {
        return pnlResult.payload;
      }

      return {
        success: false,
        error: {
          code: 'WALLET_LOOKUP_FAILED',
          message: 'Unable to load wallet data from Birdeye',
        },
      };
    }

    const pnl = pnlResult.data || {};
    const portfolio = portfolioResult.data || {};
    const items = Array.isArray(portfolio.items)
      ? portfolio.items.map((item) => ({
        address: item?.address ?? null,
        symbol: item?.symbol ?? null,
        valueUsd: toNumber(item?.valueUsd ?? item?.value_usd ?? item?.value ?? item?.usd_value),
        amount: toNumber(item?.uiAmount ?? item?.amount),
      }))
      : [];

    return {
      success: true,
      data: {
        wallet,
        pnl: {
          totalPnlUsd: toNumber(pnl.totalPnlUsd ?? pnl.total_pnl_usd ?? pnl.pnl ?? pnl.total_pnl),
          winRate: toNumber(pnl.winRate ?? pnl.win_rate ?? pnl.winPercent ?? pnl.win_percent),
          realizedPnlUsd: toNumber(pnl.realizedPnlUsd ?? pnl.realized_pnl_usd ?? pnl.realized_profit),
          unrealizedPnlUsd: toNumber(pnl.unrealizedPnlUsd ?? pnl.unrealized_pnl_usd ?? pnl.unrealized_profit),
        },
        portfolio: {
          totalValueUsd: toNumber(portfolio.totalValueUsd ?? portfolio.total_value_usd ?? portfolio.total_value ?? portfolio.totalValue),
          itemCount: items.length,
          items,
        },
      },
      meta: {
        source: 'birdeye',
      },
    };
  }

  async function getTrending() {
    const result = await birdeyeGet('trending', '/defi/v3/token/meme/list');

    if (!result.ok) {
      if (result.payload) {
        return result.payload;
      }

      return {
        success: false,
        error: {
          code: 'TRENDING_LOOKUP_FAILED',
          message: 'Unable to load trending data from Birdeye',
        },
      };
    }

    const rawItems = Array.isArray(result.data?.items) ? result.data.items : [];

    return {
      success: true,
      data: {
        items: rawItems.map((item) => ({
          address: item?.address ?? null,
          name: item?.name ?? null,
          symbol: item?.symbol ?? null,
          price: toNumber(item?.price),
          change24hPercent: toNumber(item?.change24hPercent ?? item?.price24hChangePercent ?? item?.price_24h_change_percent ?? item?.priceChange24hPercent),
          volume24hUsd: toNumber(item?.volume24hUsd ?? item?.volume24hUSD ?? item?.volume_24h_usd ?? item?.v24hUSD),
          marketCap: toNumber(item?.marketCap ?? item?.mc ?? item?.market_cap),
          logoUri: item?.logoUri ?? item?.logoURI ?? item?.logo_uri ?? null,
        })),
      },
      meta: {
        source: 'birdeye',
        refreshSeconds: 30,
      },
    };
  }

  function getUsage() {
    return {
      success: true,
      data: usageStore.getSummary(),
    };
  }

  return {
    getUsage,
    getToken,
    getWallet,
    getTrending,
  };
}

module.exports = {
  buildChartUrl,
  createTrenchScopeAdapter,
  normalizeBaseUrl,
  getRetryDelayMs,
  mapHolderItems,
  missingKeyPayload,
  toNumber,
};
