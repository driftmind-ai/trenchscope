import { useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import apiService from '../services/api';
import { deriveRadarItems, getRadarBadges } from './trenchscope/radarUtils.js';
import {
  WATCHLIST_STORAGE_KEY,
  createTokenWatchItem,
  createWalletWatchItem,
  loadWatchlistFromStorage,
  removeWatchItem,
  saveWatchlistToStorage,
  touchWatchItem,
  upsertWatchItem,
} from './trenchscope/watchlistUtils.js';

const compactUsdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US');
const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

function formatUsd(value) {
  if (value === null || value === undefined) {
    return '—';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1 ? 2 : 6,
  }).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return '—';
  }

  return `${value.toFixed(2)}%`;
}

function formatCompactUsd(value) {
  if (value === null || value === undefined) {
    return '—';
  }

  return compactUsdFormatter.format(value);
}

function formatCount(value) {
  if (value === null || value === undefined) {
    return '—';
  }

  return numberFormatter.format(value);
}

function formatCompactNumber(value) {
  if (value === null || value === undefined) {
    return '—';
  }

  return compactNumberFormatter.format(value);
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleString();
}

function formatAddress(value) {
  if (!value) {
    return '—';
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatRelativeWatchTimestamp(value) {
  if (value === null) {
    return 'Never checked';
  }

  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0);

  if (diffMinutes < 1) {
    return 'Just checked';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getUsageBarWidth(count, maxCount) {
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(maxCount) || maxCount <= 0) {
    return '0%';
  }

  return `${Math.max((count / maxCount) * 100, 8)}%`;
}

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

function TrendRadarSection({ items, loading, error, onSelectToken, selectedAddress }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSortMetric, setActiveSortMetric] = useState(null);

  const { items: visibleItems, volumeMedian } = deriveRadarItems(items, {
    query: searchQuery,
    sortMetric: activeSortMetric,
  });

  const sortOptions = [
    { label: 'Change %', value: 'change24hPercent' },
    { label: 'Volume', value: 'volume24hUsd' },
    { label: 'MCap', value: 'marketCap' },
  ];

  const handleSortClick = (metric) => {
    setActiveSortMetric((current) => (current === metric ? null : metric));
  };

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-white">Trend Radar</h2>
          <p className="text-sm text-slate-300">Live meme token momentum from the TrenchScope feed.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
          <span className="h-2 w-2 rounded-full bg-cyan-300 animate-trenchscope-pulse" />
          <span>Live</span>
          <span className="text-[10px] font-normal uppercase tracking-[0.16em] text-cyan-100/70">
            30s refresh
          </span>
        </span>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          <label htmlFor="trend-radar-search" className="block text-xs uppercase tracking-[0.2em] text-slate-400">
            Search
          </label>
          <div className="relative">
            <input
              id="trend-radar-search"
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name or symbol..."
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/20"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Clear radar search"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {sortOptions.map((option) => {
            const isActive = activeSortMetric === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSortClick(option.value)}
                aria-label={isActive ? `Sorted by ${option.label}, click to reset` : `Sort by ${option.label}`}
                aria-pressed={isActive}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition ${
                  isActive
                    ? 'border-cyan-400/30 bg-cyan-400/15 text-cyan-100 shadow-inner shadow-cyan-950/30'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/30 hover:bg-white/10 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-black px-4 py-6 text-sm text-gray-300">
          Loading trending tokens...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-900/60 bg-black px-4 py-6 text-sm text-red-400">
          {error}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-black px-4 py-6 text-sm text-gray-300">
          No matching trending tokens right now.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item, index) => {
            const change24hPercent = item.change24hPercent ?? 0;
            const changeClass = change24hPercent >= 0 ? 'text-green-400' : 'text-red-400';
            const edgeTone = change24hPercent >= 0 ? 'border-l-emerald-400/50' : 'border-l-rose-400/50';
            const badges = getRadarBadges(item, { volumeMedian });
            const isSelected = Boolean(item.address && selectedAddress && item.address === selectedAddress);

            return (
              <button
                key={item.address || `${item.symbol || 'token'}-${index}`}
                type="button"
                onClick={() => onSelectToken(item.address || '')}
                className={`w-full rounded-2xl border border-l-2 p-4 text-left transition ${edgeTone} ${
                  isSelected
                    ? 'border-cyan-400/45 bg-cyan-400/10 ring-1 ring-cyan-400/30'
                    : 'border-white/10 bg-white/5 hover:-translate-y-0.5 hover:border-cyan-400/20 hover:bg-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-semibold text-white">
                        {item.name || 'Unnamed Token'}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {badges.map((badge) => (
                          <span
                            key={`${item.address || item.symbol || index}-${badge}`}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              badge === 'Hot'
                                ? 'bg-orange-500/15 text-orange-300'
                                : badge === 'Pump'
                                  ? 'bg-green-500/15 text-green-300'
                                  : 'bg-red-500/15 text-red-300'
                            }`}
                          >
                            {badge === 'Hot' ? '🔥 Hot' : badge === 'Pump' ? '🚀 Pump' : '📉 Dip'}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                      {item.symbol || '—'}
                    </div>
                  </div>
                  <div className={`shrink-0 text-sm font-medium ${changeClass}`}>
                    {formatPercent(change24hPercent)}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <div className="text-gray-400">Price</div>
                    <div className="mt-1 text-white">{formatUsd(item.price)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">24h Volume</div>
                    <div className="mt-1 text-white">{formatCompactUsd(item.volume24hUsd)}</div>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <div className="text-gray-400">Market Cap</div>
                    <div className="mt-1 text-white">{formatCompactUsd(item.marketCap)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function WatchlistSection({
  items,
  softLimitReached,
  refreshProgress,
  batchLocked,
  refreshingMap,
  errorMap,
  onSelectToken,
  onSelectWallet,
  onRefreshItem,
  onRefreshAll,
  onRemoveItem,
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-white">Watchlist</h2>
          <p className="text-sm text-slate-300">Tracked tokens and wallets saved across sessions.</p>
        </div>
        <button
          type="button"
          onClick={onRefreshAll}
          disabled={items.length === 0 || Boolean(refreshProgress)}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:border-cyan-400/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${refreshProgress ? 'animate-spin' : ''}`} />
          Refresh All
        </button>
      </div>

      {refreshProgress ? (
        <div className="mb-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-xs text-cyan-100">
          Refreshing {refreshProgress.current}/{refreshProgress.total}...
        </div>
      ) : null}

      {softLimitReached ? (
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
          Keeping the watchlist compact is recommended. More than 5 items may make manual refresh slower.
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-black px-4 py-6 text-sm text-gray-300">
          No watched items yet. Use the watch toggle in Token Scope or Wallet Scope to save something here.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const itemKey = `${item.type}:${item.address}`;
            const isRefreshing = Boolean(refreshingMap[itemKey]);
            const itemError = errorMap[itemKey] || '';

            return (
              <div
                key={itemKey}
                className={`rounded-2xl border border-white/10 bg-white/5 p-4 transition ${isRefreshing || batchLocked ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      item.type === 'token' ? onSelectToken(item.address) : onSelectWallet(item.address)
                    }
                    className="min-w-0 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-semibold text-white">{item.label}</div>
                      <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-100">
                        {item.type === 'token' ? 'Token' : 'Wallet'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{formatAddress(item.address)}</div>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRefreshItem(item)}
                      disabled={isRefreshing || batchLocked}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:border-cyan-400/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ArrowPathIcon className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item)}
                      disabled={batchLocked}
                      className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-100"
                      aria-label={`Remove ${item.label} from watchlist`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                  <span>Added {formatDateTime(item.addedAt)}</span>
                  <span>Last checked: {formatRelativeWatchTimestamp(item.lastCheckedAt)}</span>
                </div>

                {itemError ? (
                  <div className="mt-3 text-xs text-rose-300">❌ {itemError}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TokenScopeSection({ data, loading, error, isWatched, onToggleWatch }) {
  const distributionItems = Array.isArray(data?.holderDistribution?.items)
    ? data.holderDistribution.items.slice(0, 5)
    : [];
  const security = data?.security && typeof data.security === 'object' ? data.security : null;
  const contentAnimationClass = !loading && !error && data ? 'animate-trenchscope-fade-slide space-y-5' : 'space-y-5';

  const overviewCards = [
    { label: 'Price', value: formatUsd(data?.overview?.price) },
    { label: 'Liquidity', value: formatCompactUsd(data?.overview?.liquidity) },
    { label: 'Market Cap', value: formatCompactUsd(data?.overview?.marketCap) },
    { label: '24h Volume', value: formatCompactUsd(data?.overview?.volume24h) },
    { label: 'Holders', value: formatCount(data?.overview?.holderCount) },
  ];

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-cyan-500/15 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.08),transparent_28%)]" />
      <div className="relative mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">Token Scope</h2>
          <p className="text-sm text-slate-300">Overview, security posture, holder concentration, and chart context.</p>
        </div>
        {data?.address ? (
          <button
            type="button"
            onClick={onToggleWatch}
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:border-cyan-400/30 hover:bg-white/10"
          >
            {isWatched ? '★ Watching' : '☆ Watch'}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-black px-4 py-6 text-sm text-gray-300">
          Loading token scope...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-900/60 bg-black px-4 py-6 text-sm text-red-400">
          {error}
        </div>
      ) : !data ? (
        <div className="rounded-xl border border-gray-800 bg-black px-4 py-6 text-sm text-gray-300">
          Enter a token address or click a Trend Radar item to inspect token data.
        </div>
      ) : (
        <div className={contentAnimationClass}>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-inner shadow-slate-950/30">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xl font-semibold tracking-tight text-white">{data.overview?.name || 'Unnamed Token'}</div>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-cyan-100">
                  {data.overview?.symbol || '—'}
                </span>
              </div>
              <div className="text-sm text-slate-300">Live token intelligence with security and liquidity context.</div>
            </div>
            {data.overview?.logoUri ? (
              <img
                src={data.overview.logoUri}
                alt={data.overview?.symbol || 'Token logo'}
                className="h-12 w-12 rounded-full border border-white/10 object-cover shadow-[0_8px_24px_rgba(15,23,42,0.35)]"
              />
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {overviewCards.map((card) => (
              <div
                key={card.label}
                className={
                  card.label === 'Price'
                    ? 'rounded-[22px] border border-cyan-400/20 bg-gradient-to-br from-cyan-400/15 via-sky-400/10 to-white/5 p-4 shadow-[0_18px_40px_rgba(34,211,238,0.08)]'
                    : 'rounded-[22px] border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-4 shadow-inner shadow-slate-950/30'
                }
              >
                <div className="text-xs uppercase tracking-wide text-slate-400">{card.label}</div>
                <div className={`mt-2 font-semibold text-white ${card.label === 'Price' ? 'text-base' : 'text-sm'}`}>{card.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-inner shadow-slate-950/30">
            <div className="mb-3 text-sm font-semibold text-white">Security</div>
            {security ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Creator</div>
                  <div className="mt-1 break-all text-sm text-white">{security.creatorAddress || '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Freeze Authority</div>
                  <div className="mt-1 break-all text-sm text-white">
                    {security.freezeAuthority ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Mint Authority</div>
                  <div className="mt-1 break-all text-sm text-white">
                    {security.mintAuthority ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Risk Summary</div>
                  <div className="mt-1 text-sm text-white">{security.riskSummary || 'No risk summary provided.'}</div>
                </div>
              </div>
            ) : (
              <div className="rounded-[20px] border border-cyan-400/10 bg-slate-950/70 px-4 py-4 text-sm text-slate-300">
                Security data is currently unavailable for this token. Birdeye token security is treated as best-effort and may be blocked for the current API key.
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-inner shadow-slate-950/30">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Holder Distribution</div>
              <div className="text-xs text-slate-300">
                Top 10 concentration: {formatPercent(data.holderDistribution?.top10Percent)}
              </div>
            </div>

            {distributionItems.length === 0 ? (
              <div className="text-sm text-gray-300">No holder distribution data available.</div>
            ) : (
              <div className="space-y-3">
                {distributionItems.map((item, index) => (
                  <div
                    key={`${item.owner || 'holder'}-${index}`}
                    className="flex flex-col gap-2 rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-400">Holder {index + 1}</div>
                      <div className="break-all text-sm text-white">{item.owner || 'Unknown holder'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm sm:text-right">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">Amount</div>
                        <div className="text-white">{formatCompactNumber(item.amount)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">Share</div>
                        <div className="text-white">{formatPercent(item.percentage)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-inner shadow-slate-950/30">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Birdeye Chart</div>
              <div className="text-xs text-slate-400">Widget URL is locally constructed</div>
            </div>

            {data.chart?.embedUrl ? (
              <iframe
                src={data.chart.embedUrl}
                title="TrenchScope Token Chart"
                className="h-[320px] w-full rounded-xl border-0 bg-gray-900"
                frameBorder="0"
                allow="clipboard-write"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            ) : (
              <div className="rounded-[20px] border border-white/10 bg-slate-950/70 px-4 py-10 text-center text-sm text-slate-300">
                Chart unavailable for this token.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function WalletScopeSection({ data, loading, error, isWatched, onToggleWatch }) {
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const holdings = Array.isArray(data?.portfolio?.items) ? data.portfolio.items : [];
  const sortedHoldings = [...holdings]
    .map((item, index) => ({ ...item, __originalIndex: index }))
    .sort((left, right) => {
      const leftValue = Number.isFinite(left?.valueUsd) ? left.valueUsd : null;
      const rightValue = Number.isFinite(right?.valueUsd) ? right.valueUsd : null;

      if (leftValue === null && rightValue === null) {
        return left.__originalIndex - right.__originalIndex;
      }

      if (leftValue === null) {
        return 1;
      }

      if (rightValue === null) {
        return -1;
      }

      if (leftValue === rightValue) {
        return left.__originalIndex - right.__originalIndex;
      }

      return rightValue - leftValue;
    })
    .map(({ __originalIndex, ...item }) => item);
  const hasExpandableHoldings = sortedHoldings.length > 5;
  const visibleHoldings = showAllHoldings ? sortedHoldings : sortedHoldings.slice(0, 5);
  const totalPnlValue = data?.pnl?.totalPnlUsd ?? null;
  const winRateValue = data?.pnl?.winRate ?? null;
  const headerChipLabel =
    totalPnlValue === null || totalPnlValue === undefined
      ? 'PnL unavailable'
      : winRateValue === null || winRateValue === undefined
        ? `Total PnL ${formatUsd(totalPnlValue)}`
        : `Total PnL ${formatUsd(totalPnlValue)} · ${formatPercent(winRateValue)} WR`;
  const pnlTone =
    totalPnlValue === null || totalPnlValue === undefined
      ? 'border-white/10 bg-white/5 text-slate-300'
      : totalPnlValue >= 0
        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
        : 'border-rose-400/20 bg-rose-400/10 text-rose-100';
  const pnlIcon =
    totalPnlValue === null || totalPnlValue === undefined ? null : totalPnlValue >= 0 ? (
      <ArrowTrendingUpIcon className="h-3.5 w-3.5" />
    ) : (
      <ArrowTrendingDownIcon className="h-3.5 w-3.5" />
    );
  const contentAnimationClass = !loading && !error && data ? 'animate-trenchscope-fade-slide space-y-5' : 'space-y-5';
  const pnlCards = [
    { label: 'Total PnL', value: formatUsd(data?.pnl?.totalPnlUsd) },
    { label: 'Win Rate', value: formatPercent(data?.pnl?.winRate) },
    { label: 'Realized', value: formatUsd(data?.pnl?.realizedPnlUsd) },
    { label: 'Unrealized', value: formatUsd(data?.pnl?.unrealizedPnlUsd) },
  ];

  useEffect(() => {
    setShowAllHoldings(false);
  }, [data?.wallet]);

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-cyan-500/15 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.08),transparent_28%)]" />
      <div className="relative mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">Wallet Scope</h2>
          <p className="text-sm text-slate-300">PnL summary and current portfolio composition for a wallet.</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.wallet ? (
            <button
              type="button"
              onClick={onToggleWatch}
              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:border-cyan-400/30 hover:bg-white/10"
            >
              {isWatched ? '★ Watching' : '☆ Watch'}
            </button>
          ) : null}
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${pnlTone}`}>
            {pnlIcon}
            <span>{headerChipLabel}</span>
          </span>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-black px-4 py-6 text-sm text-gray-300">
          Loading wallet scope...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-900/60 bg-black px-4 py-6 text-sm text-red-400">
          {error}
        </div>
      ) : !data ? (
        <div className="rounded-xl border border-gray-800 bg-black px-4 py-6 text-sm text-gray-300">
          Paste a Solana wallet address above to see performance data, portfolio value, and top holdings.
        </div>
      ) : (
        <div className={contentAnimationClass}>
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-inner shadow-slate-950/30">
            <div className="text-xs uppercase tracking-wide text-slate-400">Wallet</div>
            <div className="mt-2 break-all text-sm text-white">{data.wallet || '—'}</div>
            <div className="mt-1 text-xs text-slate-400">
              Total portfolio value: {formatCompactUsd(data.portfolio?.totalValueUsd)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {pnlCards.map((card) => (
              <div
                key={card.label}
                className="rounded-[22px] border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-4 shadow-inner shadow-slate-950/30"
              >
                <div className="text-xs uppercase tracking-wide text-slate-400">{card.label}</div>
                <div className="mt-2 text-sm font-semibold text-white">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-inner shadow-slate-950/30">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Holdings</div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-slate-400">{formatCount(data.portfolio?.itemCount)} items</div>
                {hasExpandableHoldings ? (
                  <button
                    type="button"
                    onClick={() => setShowAllHoldings((current) => !current)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
                  >
                    {showAllHoldings ? 'Show less' : `Show all ${formatCount(sortedHoldings.length)}`}
                  </button>
                ) : null}
              </div>
            </div>

            {sortedHoldings.length === 0 ? (
              <div className="text-sm text-gray-300">No portfolio holdings were returned for this wallet.</div>
            ) : (
              <div className="space-y-3">
                {visibleHoldings.map((item, index) => (
                  <div
                    key={`${item.address || item.symbol || 'holding'}-${index}`}
                    className="flex flex-col gap-2 rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{item.symbol || 'Unknown'}</div>
                      <div className="truncate text-xs text-slate-400">{item.address || '—'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm sm:text-right">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">Amount</div>
                        <div className="text-white">{formatCompactNumber(item.amount)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">Value</div>
                        <div className="text-white">{formatUsd(item.valueUsd)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function UsageSection({ data, loading, error }) {
  const endpointEntries = Object.entries(data?.endpoints || {});
  const maxEndpointCount = endpointEntries.reduce(
    (max, [, count]) => Math.max(max, Number.isFinite(count) ? count : Number(count) || 0),
    0,
  );

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-cyan-500/15 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.08),transparent_28%)]" />
      <div className="relative mb-5">
        <h2 className="text-lg font-semibold tracking-tight text-white">Usage</h2>
        <p className="text-sm text-slate-300">Lightweight endpoint call telemetry for the TrenchScope proxy.</p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-black px-4 py-6 text-sm text-gray-300">
          Loading usage data...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-900/60 bg-black px-4 py-6 text-sm text-red-400">
          {error}
        </div>
      ) : (
        <div className="relative space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-cyan-400/20 bg-gradient-to-br from-cyan-400/15 via-sky-400/10 to-white/5 p-4 shadow-[0_18px_40px_rgba(34,211,238,0.08)]">
              <div className="text-xs uppercase tracking-[0.18em] text-cyan-100/70">Total Calls</div>
              <div className="mt-2 text-2xl font-semibold text-white">{formatCount(data?.totalCalls)}</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-4 shadow-inner shadow-slate-950/30">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Since</div>
              <div className="mt-2 text-sm font-medium text-white">{formatDateTime(data?.since)}</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-4 shadow-inner shadow-slate-950/30">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Last Updated</div>
              <div className="mt-2 text-sm font-medium text-white">{formatDateTime(data?.lastUpdatedAt)}</div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-inner shadow-slate-950/30">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Per-endpoint counts</div>
              <div className="text-xs text-slate-400">Peak: {formatCount(maxEndpointCount)}</div>
            </div>
            {endpointEntries.length === 0 ? (
              <div className="text-sm text-slate-300">No endpoint usage has been recorded yet.</div>
            ) : (
              <div className="space-y-3">
                {endpointEntries.map(([endpoint, count]) => (
                  <div
                    key={endpoint}
                    className="rounded-[20px] border border-white/10 bg-slate-950/70 px-4 py-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-slate-200">{endpoint}</span>
                      <span className="shrink-0 font-medium text-white">{formatCount(count)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                        style={{ width: getUsageBarWidth(Number(count), maxEndpointCount) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default function TrenchScope() {
  const [tokenAddress, setTokenAddress] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [trendingItems, setTrendingItems] = useState([]);
  const [tokenData, setTokenData] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [usageData, setUsageData] = useState(null);
  const [loading, setLoading] = useState({
    trending: true,
    token: false,
    wallet: false,
    usage: true,
  });
  const [errors, setErrors] = useState({
    trending: '',
    token: '',
    wallet: '',
    usage: '',
  });
  const [activeLeftTab, setActiveLeftTab] = useState('radar');
  const [watchlistItems, setWatchlistItems] = useState(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    const rawValue = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    return loadWatchlistFromStorage(rawValue);
  });
  const [watchlistRefreshingMap, setWatchlistRefreshingMap] = useState({});
  const [watchlistErrorMap, setWatchlistErrorMap] = useState({});
  const [watchlistRefreshProgress, setWatchlistRefreshProgress] = useState(null);
  const tokenRequestSequenceRef = useRef(0);
  const walletRequestSequenceRef = useRef(0);
  const openTokenScopeRef = useRef('');
  const openWalletScopeRef = useRef('');

  const canRefresh = Boolean(tokenAddress.trim() || walletAddress.trim());
  const watchlistSoftLimitReached = watchlistItems.length > 5;
  const isBatchRefreshingWatchlist = Boolean(watchlistRefreshProgress);

  const tokenWatchKey = tokenData?.address ? `token:${tokenData.address}` : null;
  const walletWatchKey = walletData?.wallet ? `wallet:${walletData.wallet}` : null;

  const isCurrentTokenWatched = tokenWatchKey
    ? watchlistItems.some((item) => item.type === 'token' && item.address === tokenData.address)
    : false;

  const isCurrentWalletWatched = walletWatchKey
    ? watchlistItems.some((item) => item.type === 'wallet' && item.address === walletData.wallet)
    : false;

  useEffect(() => {
    openTokenScopeRef.current = tokenData?.address?.trim() || '';
  }, [tokenData]);

  useEffect(() => {
    openWalletScopeRef.current = walletData?.wallet?.trim() || '';
  }, [walletData]);

  const loadUsage = async () => {
    setLoading((current) => ({ ...current, usage: true }));
    setErrors((current) => ({ ...current, usage: '' }));

    try {
      const response = await apiService.getTrenchScopeUsage();

      if (response.data?.success) {
        setUsageData(response.data.data || null);
      } else {
        setErrors((current) => ({
          ...current,
          usage: response.data?.error?.message || 'Failed to load usage data.',
        }));
      }
    } catch (error) {
      setErrors((current) => ({
        ...current,
        usage: getErrorMessage(error, 'Failed to load usage data.'),
      }));
    } finally {
      setLoading((current) => ({ ...current, usage: false }));
    }
  };

  const loadTrending = async () => {
    setLoading((current) => ({ ...current, trending: true }));
    setErrors((current) => ({ ...current, trending: '' }));

    try {
      const response = await apiService.getTrenchScopeTrending();

      if (response.data?.success) {
        setTrendingItems(response.data?.data?.items || []);
      } else {
        setTrendingItems([]);
        setErrors((current) => ({
          ...current,
          trending: response.data?.error?.message || 'Failed to load trending tokens.',
        }));
      }
    } catch (error) {
      setTrendingItems([]);
      setErrors((current) => ({
        ...current,
        trending: getErrorMessage(error, 'Failed to load trending tokens.'),
      }));
    } finally {
      setLoading((current) => ({ ...current, trending: false }));
    }
  };

  const loadToken = async (nextAddress = tokenAddress) => {
    const value = nextAddress.trim();
    if (!value) {
      return;
    }

    const requestSequence = tokenRequestSequenceRef.current + 1;
    tokenRequestSequenceRef.current = requestSequence;

    setLoading((current) => ({ ...current, token: true }));
    setErrors((current) => ({ ...current, token: '' }));

    try {
      const response = await apiService.getTrenchScopeToken(value);
      if (requestSequence !== tokenRequestSequenceRef.current) {
        return;
      }

      if (response.data?.success) {
        setTokenData(response.data.data || null);
      } else {
        setTokenData(null);
        setErrors((current) => ({
          ...current,
          token: response.data?.error?.message || 'Failed to load token scope.',
        }));
      }
    } catch (error) {
      if (requestSequence !== tokenRequestSequenceRef.current) {
        return;
      }

      setTokenData(null);
      setErrors((current) => ({
        ...current,
        token: getErrorMessage(error, 'Failed to load token scope.'),
      }));
    } finally {
      if (requestSequence !== tokenRequestSequenceRef.current) {
        return;
      }

      setLoading((current) => ({ ...current, token: false }));
      await loadUsage();
    }
  };

  const loadWallet = async (nextWallet = walletAddress) => {
    const value = nextWallet.trim();
    if (!value) {
      return;
    }

    const requestSequence = walletRequestSequenceRef.current + 1;
    walletRequestSequenceRef.current = requestSequence;

    setLoading((current) => ({ ...current, wallet: true }));
    setErrors((current) => ({ ...current, wallet: '' }));

    try {
      const response = await apiService.getTrenchScopeWallet(value);
      if (requestSequence !== walletRequestSequenceRef.current) {
        return;
      }

      if (response.data?.success) {
        setWalletData(response.data.data || null);
      } else {
        setWalletData(null);
        setErrors((current) => ({
          ...current,
          wallet: response.data?.error?.message || 'Failed to load wallet scope.',
        }));
      }
    } catch (error) {
      if (requestSequence !== walletRequestSequenceRef.current) {
        return;
      }

      setWalletData(null);
      setErrors((current) => ({
        ...current,
        wallet: getErrorMessage(error, 'Failed to load wallet scope.'),
      }));
    } finally {
      if (requestSequence !== walletRequestSequenceRef.current) {
        return;
      }

      setLoading((current) => ({ ...current, wallet: false }));
      await loadUsage();
    }
  };

  const handleRefresh = async () => {
    if (isBatchRefreshingWatchlist) {
      return;
    }

    if (tokenAddress.trim()) {
      await loadToken(tokenAddress);
    }

    if (walletAddress.trim()) {
      await loadWallet(walletAddress);
    }
  };

  const handleTokenKeyDown = async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await loadToken();
    }
  };

  const handleWalletKeyDown = async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await loadWallet();
    }
  };

  const handleSelectTrendingToken = async (address) => {
    setTokenAddress(address);
    await loadToken(address);
  };

  const handleToggleTokenWatch = () => {
    if (!tokenData?.address) {
      return;
    }

    const existing = watchlistItems.some(
      (item) => item.type === 'token' && item.address === tokenData.address,
    );

    if (existing) {
      setWatchlistItems((current) => removeWatchItem(current, { type: 'token', address: tokenData.address }));
      setWatchlistErrorMap((current) => {
        const next = { ...current };
        delete next[`token:${tokenData.address}`];
        return next;
      });
      return;
    }

    const nextItem = createTokenWatchItem({
      address: tokenData.address,
      overview: tokenData.overview,
      now: new Date().toISOString(),
      formatAddress,
    });

    setWatchlistItems((current) => upsertWatchItem(current, nextItem));
  };

  const handleToggleWalletWatch = () => {
    if (!walletData?.wallet) {
      return;
    }

    const existing = watchlistItems.some(
      (item) => item.type === 'wallet' && item.address === walletData.wallet,
    );

    if (existing) {
      setWatchlistItems((current) => removeWatchItem(current, { type: 'wallet', address: walletData.wallet }));
      setWatchlistErrorMap((current) => {
        const next = { ...current };
        delete next[`wallet:${walletData.wallet}`];
        return next;
      });
      return;
    }

    const nextItem = createWalletWatchItem({
      address: walletData.wallet,
      now: new Date().toISOString(),
      formatAddress,
    });

    setWatchlistItems((current) => upsertWatchItem(current, nextItem));
  };

  const refreshWatchlistItem = async (item) => {
    const itemKey = `${item.type}:${item.address}`;

    if (watchlistRefreshProgress && !watchlistRefreshingMap[itemKey]) {
      return;
    }

    setWatchlistRefreshingMap((current) => ({ ...current, [itemKey]: true }));
    setWatchlistErrorMap((current) => {
      const next = { ...current };
      delete next[itemKey];
      return next;
    });

    try {
      if (item.type === 'token') {
        const response = await apiService.getTrenchScopeToken(item.address);
        if (!response.data?.success) {
          throw new Error(response.data?.error?.message || 'Failed to refresh token watch item.');
        }

        setWatchlistItems((current) =>
          touchWatchItem(current, {
            type: 'token',
            address: item.address,
            checkedAt: new Date().toISOString(),
          }),
        );

        if (openTokenScopeRef.current === item.address) {
          setTokenData(response.data.data || null);
        }
      } else {
        const response = await apiService.getTrenchScopeWallet(item.address);
        if (!response.data?.success) {
          throw new Error(response.data?.error?.message || 'Failed to refresh wallet watch item.');
        }

        setWatchlistItems((current) =>
          touchWatchItem(current, {
            type: 'wallet',
            address: item.address,
            checkedAt: new Date().toISOString(),
          }),
        );

        if (openWalletScopeRef.current === item.address) {
          setWalletData(response.data.data || null);
        }
      }

      await loadUsage();
    } catch (error) {
      setWatchlistErrorMap((current) => ({
        ...current,
        [itemKey]: getErrorMessage(error, 'Failed to refresh watch item.'),
      }));
    } finally {
      setWatchlistRefreshingMap((current) => ({ ...current, [itemKey]: false }));
    }
  };

  const handleRefreshAllWatchlist = async () => {
    if (watchlistItems.length === 0 || isBatchRefreshingWatchlist) {
      return;
    }

    const snapshot = [...watchlistItems];

    for (let index = 0; index < snapshot.length; index += 1) {
      setWatchlistRefreshProgress({ current: index + 1, total: snapshot.length });
      await refreshWatchlistItem(snapshot[index]);
      if (index < snapshot.length - 1) {
        await sleep(500);
      }
    }

    setWatchlistRefreshProgress(null);
  };

  useEffect(() => {
    loadTrending();
    loadUsage();

    const intervalId = setInterval(() => {
      loadTrending();
      loadUsage();
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, saveWatchlistToStorage(watchlistItems));
  }, [watchlistItems]);

  return (
    <div className="space-y-6 bg-black text-white">
      <section className="relative overflow-hidden rounded-[32px] border border-cyan-500/15 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-[0_0_60px_rgba(34,211,238,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.1),transparent_28%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-white">TrenchScope</h1>
              <span className="relative overflow-hidden rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
                <span className="absolute inset-0 animate-trenchscope-shimmer" />
                <span className="relative">Powered by Birdeye</span>
              </span>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-300">
              Thin contest-facing token and wallet intelligence with trending discovery, scoped drill-downs, and usage telemetry.
            </p>
          </div>

          <div className="grid w-full gap-3 xl:max-w-4xl xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Token address</span>
              <input
                type="text"
                value={tokenAddress}
                onChange={(event) => setTokenAddress(event.target.value)}
                onKeyDown={handleTokenKeyDown}
                placeholder="Paste token mint"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/20"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Wallet address</span>
              <input
                type="text"
                value={walletAddress}
                onChange={(event) => setWalletAddress(event.target.value)}
                onKeyDown={handleWalletKeyDown}
                placeholder="Paste wallet address"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/20"
              />
            </label>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={!canRefresh || loading.token || loading.wallet || isBatchRefreshingWatchlist}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:border-cyan-400/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${(loading.token || loading.wallet) ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {(tokenAddress.trim() || walletAddress.trim()) && (
          <div className="relative mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
            {tokenAddress.trim() ? <span>Token: {formatAddress(tokenAddress.trim())}</span> : null}
            {walletAddress.trim() ? <span>Wallet: {formatAddress(walletAddress.trim())}</span> : null}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setActiveLeftTab('radar')}
              className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                activeLeftTab === 'radar'
                  ? 'bg-cyan-400/15 text-cyan-100'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Radar
            </button>
            <button
              type="button"
              onClick={() => setActiveLeftTab('watchlist')}
              className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                activeLeftTab === 'watchlist'
                  ? 'bg-cyan-400/15 text-cyan-100'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Watchlist
            </button>
          </div>
          {activeLeftTab === 'radar' ? (
            <TrendRadarSection
              items={trendingItems}
              loading={loading.trending}
              error={errors.trending}
              onSelectToken={handleSelectTrendingToken}
              selectedAddress={tokenAddress}
            />
          ) : (
            <WatchlistSection
              items={watchlistItems}
              softLimitReached={watchlistSoftLimitReached}
              refreshProgress={watchlistRefreshProgress}
              batchLocked={isBatchRefreshingWatchlist}
              refreshingMap={watchlistRefreshingMap}
              errorMap={watchlistErrorMap}
              onSelectToken={handleSelectTrendingToken}
              onSelectWallet={async (address) => {
                setWalletAddress(address);
                await loadWallet(address);
              }}
              onRefreshItem={(item) => {
                if (isBatchRefreshingWatchlist) {
                  return;
                }

                void refreshWatchlistItem(item);
              }}
              onRefreshAll={handleRefreshAllWatchlist}
              onRemoveItem={(item) => {
                if (isBatchRefreshingWatchlist) {
                  return;
                }

                setWatchlistItems((current) => removeWatchItem(current, item));
                setWatchlistErrorMap((current) => {
                  const next = { ...current };
                  delete next[`${item.type}:${item.address}`];
                  return next;
                });
              }}
            />
          )}
          <UsageSection data={usageData} loading={loading.usage} error={errors.usage} />
        </div>

        <div className="space-y-6">
          <TokenScopeSection
            data={tokenData}
            loading={loading.token}
            error={errors.token}
            isWatched={isCurrentTokenWatched}
            onToggleWatch={handleToggleTokenWatch}
          />
          <WalletScopeSection
            data={walletData}
            loading={loading.wallet}
            error={errors.wallet}
            isWatched={isCurrentWalletWatched}
            onToggleWatch={handleToggleWalletWatch}
          />
        </div>
      </div>
    </div>
  );
}
