import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WATCHLIST_STORAGE_KEY,
  createTokenWatchItem,
  createWalletWatchItem,
  findWatchItemIndex,
  loadWatchlistFromStorage,
  removeWatchItem,
  saveWatchlistToStorage,
  touchWatchItem,
  upsertWatchItem,
} from './watchlistUtils.js';

function formatAddress(value) {
  if (!value) {
    return '—';
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

test('exports the locked storage key', () => {
  assert.equal(WATCHLIST_STORAGE_KEY, 'trenchscope_watchlist');
});

test('loadWatchlistFromStorage returns empty list for missing input', () => {
  assert.deepEqual(loadWatchlistFromStorage(null), []);
});

test('loadWatchlistFromStorage returns empty list for malformed JSON', () => {
  assert.deepEqual(loadWatchlistFromStorage('{not-json'), []);
});

test('createTokenWatchItem prefers name, then symbol, then formatted address', () => {
  const withName = createTokenWatchItem({
    address: 'So11111111111111111111111111111111111111112',
    overview: { name: 'Wrapped SOL', symbol: 'SOL' },
    now: '2026-04-21T12:00:00.000Z',
    formatAddress,
  });
  const withSymbol = createTokenWatchItem({
    address: 'Bonk111111111111111111111111111111111111111',
    overview: { name: null, symbol: 'BONK' },
    now: '2026-04-21T12:00:00.000Z',
    formatAddress,
  });
  const withFallback = createTokenWatchItem({
    address: 'JUP1111111111111111111111111111111111111111',
    overview: { name: '   ', symbol: '   ' },
    now: '2026-04-21T12:00:00.000Z',
    formatAddress,
  });

  assert.equal(withName.label, 'Wrapped SOL');
  assert.equal(withSymbol.label, 'BONK');
  assert.equal(withFallback.label, formatAddress('JUP1111111111111111111111111111111111111111'));
  assert.equal(withName.lastCheckedAt, null);
});

test('loadWatchlistFromStorage rejects malformed item fields and preserves mixed valid entries', () => {
  const payload = JSON.stringify([
    {
      type: 'token',
      address: 'token-1',
      label: 'Token 1',
      addedAt: '2026-04-21T12:00:00.000Z',
      lastCheckedAt: null,
    },
    {
      type: 'wallet',
      address: 'wallet-1',
      label: 'Wallet 1',
      addedAt: '2026-04-21T12:00:00.000Z',
      lastCheckedAt: '2026-04-21T12:05:00.000Z',
    },
    {
      type: 'wallet',
      address: 'wallet-2',
      label: 'Wallet 2',
      addedAt: '2026-04-21T12:00:00.000Z',
      lastCheckedAt: 123,
    },
    {
      type: 'token',
      address: '   ',
      label: 'Bad Token',
      addedAt: '2026-04-21T12:00:00.000Z',
      lastCheckedAt: null,
    },
    {
      type: 'token',
      address: 'token-3',
      label: 'Token 3',
      addedAt: '2026-04-21T12:00:00.000Z',
    },
  ]);

  assert.deepEqual(loadWatchlistFromStorage(payload), [
    {
      type: 'token',
      address: 'token-1',
      label: 'Token 1',
      addedAt: '2026-04-21T12:00:00.000Z',
      lastCheckedAt: null,
    },
    {
      type: 'wallet',
      address: 'wallet-1',
      label: 'Wallet 1',
      addedAt: '2026-04-21T12:00:00.000Z',
      lastCheckedAt: '2026-04-21T12:05:00.000Z',
    },
  ]);
});

test('createWalletWatchItem uses formatted address label and null lastCheckedAt', () => {
  const item = createWalletWatchItem({
    address: '7xKXtg2CWZjrQeP6VGwAQijU9UFPxw7h4Z9F8kwQ4N7o',
    now: '2026-04-21T12:00:00.000Z',
    formatAddress,
  });

  assert.equal(item.type, 'wallet');
  assert.equal(item.label, formatAddress('7xKXtg2CWZjrQeP6VGwAQijU9UFPxw7h4Z9F8kwQ4N7o'));
  assert.equal(item.lastCheckedAt, null);
});

test('upsertWatchItem dedupes by type and address', () => {
  const token = createTokenWatchItem({
    address: 'So11111111111111111111111111111111111111112',
    overview: { name: 'Wrapped SOL', symbol: 'SOL' },
    now: '2026-04-21T12:00:00.000Z',
    formatAddress,
  });

  const once = upsertWatchItem([], token);
  const twice = upsertWatchItem(once, token);

  assert.equal(once.length, 1);
  assert.equal(twice.length, 1);
});

test('token and wallet can coexist when raw address matches but types differ', () => {
  const address = 'Same111111111111111111111111111111111111111';
  const token = {
    type: 'token',
    address,
    label: 'Token Label',
    addedAt: '2026-04-21T12:00:00.000Z',
    lastCheckedAt: null,
  };
  const wallet = {
    type: 'wallet',
    address,
    label: 'Wallet Label',
    addedAt: '2026-04-21T12:00:00.000Z',
    lastCheckedAt: null,
  };

  const items = upsertWatchItem(upsertWatchItem([], token), wallet);
  assert.equal(items.length, 2);
});

test('removeWatchItem removes only the targeted item', () => {
  const items = [
    { type: 'token', address: 'token-1', label: 'Token 1', addedAt: '2026-04-21T12:00:00.000Z', lastCheckedAt: null },
    { type: 'wallet', address: 'wallet-1', label: 'Wallet 1', addedAt: '2026-04-21T12:00:00.000Z', lastCheckedAt: null },
  ];

  assert.deepEqual(removeWatchItem(items, { type: 'token', address: 'token-1' }), [
    { type: 'wallet', address: 'wallet-1', label: 'Wallet 1', addedAt: '2026-04-21T12:00:00.000Z', lastCheckedAt: null },
  ]);
});

test('touchWatchItem updates lastCheckedAt for the targeted item', () => {
  const items = [
    { type: 'token', address: 'token-1', label: 'Token 1', addedAt: '2026-04-21T12:00:00.000Z', lastCheckedAt: null },
  ];

  const updated = touchWatchItem(items, {
    type: 'token',
    address: 'token-1',
    checkedAt: '2026-04-21T12:05:00.000Z',
  });

  assert.equal(updated[0].lastCheckedAt, '2026-04-21T12:05:00.000Z');
});

test('findWatchItemIndex returns -1 when item is absent', () => {
  assert.equal(findWatchItemIndex([], { type: 'token', address: 'missing' }), -1);
});

test('saveWatchlistToStorage serializes the list', () => {
  const payload = saveWatchlistToStorage([
    { type: 'token', address: 'token-1', label: 'Token 1', addedAt: '2026-04-21T12:00:00.000Z', lastCheckedAt: null },
  ]);

  assert.equal(
    payload,
    JSON.stringify([
      { type: 'token', address: 'token-1', label: 'Token 1', addedAt: '2026-04-21T12:00:00.000Z', lastCheckedAt: null },
    ]),
  );
});
