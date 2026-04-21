import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveRadarItems, getRadarBadges, getMedian, normalizeQuery } from './radarUtils.js';

const sampleItems = [
  {
    address: 'token-1',
    name: 'Alpha',
    symbol: 'ALP',
    price: 1,
    volume24hUsd: 100,
    marketCap: 1000,
    change24hPercent: 10,
  },
  {
    address: 'token-2',
    name: 'Bravo',
    symbol: 'BRV',
    price: 2,
    volume24hUsd: 1000,
    marketCap: 900,
    change24hPercent: 45,
  },
  {
    address: 'token-3',
    name: 'Charlie',
    symbol: 'CHA',
    price: 3,
    volume24hUsd: 40,
    marketCap: 2000,
    change24hPercent: -25,
  },
  {
    address: 'token-4',
    name: null,
    symbol: null,
    price: 4,
    volume24hUsd: null,
    marketCap: null,
    change24hPercent: null,
  },
  {
    address: 'token-5',
    name: 'Bonk',
    symbol: 'BONK',
    price: 5,
    volume24hUsd: 5000,
    marketCap: 50000,
    change24hPercent: 5,
  },
];

test('getMedian returns the middle value for odd-length lists', () => {
  assert.equal(getMedian([40, 100, 1000]), 100);
});

test('getMedian returns the average for even-length lists', () => {
  assert.equal(getMedian([40, 100, 1000, 2000]), 550);
});

test('getMedian ignores invalid values and returns null when none remain', () => {
  assert.equal(getMedian([null, undefined, NaN, Infinity]), null);
});

test('normalizeQuery preserves numeric zero input', () => {
  assert.equal(normalizeQuery(0), '0');
});

test('deriveRadarItems filters by name or symbol case-insensitively', () => {
  const { items } = deriveRadarItems(sampleItems, { query: 'brv', sortMetric: null });
  assert.deepEqual(items.map((item) => item.address), ['token-2']);
});

test('deriveRadarItems handles an empty item list', () => {
  const { items, volumeMedian } = deriveRadarItems([], { query: '', sortMetric: null });
  assert.deepEqual(items, []);
  assert.equal(volumeMedian, null);
});

test('deriveRadarItems returns an empty list when no items match the search query', () => {
  const { items } = deriveRadarItems(sampleItems, { query: 'zzzzz', sortMetric: null });
  assert.deepEqual(items, []);
});

test('deriveRadarItems keeps the volume median baseline stable under search filtering', () => {
  const { items, volumeMedian } = deriveRadarItems(sampleItems, { query: 'bonk', sortMetric: null });

  assert.deepEqual(items.map((item) => item.address), ['token-5']);
  assert.equal(volumeMedian, 550);
});

test('deriveRadarItems keeps default API order when no sort is active', () => {
  const { items } = deriveRadarItems(sampleItems, { query: '', sortMetric: null });
  assert.deepEqual(items.map((item) => item.address), ['token-1', 'token-2', 'token-3', 'token-4', 'token-5']);
});

test('deriveRadarItems sorts descending by the chosen metric and keeps null values last', () => {
  const { items } = deriveRadarItems(sampleItems, { query: '', sortMetric: 'marketCap' });
  assert.deepEqual(items.map((item) => item.address), ['token-5', 'token-3', 'token-1', 'token-2', 'token-4']);
});

test('getRadarBadges returns Hot and Pump when both rules match', () => {
  const badges = getRadarBadges(sampleItems[1], { volumeMedian: 100 });
  assert.deepEqual(badges, ['Hot', 'Pump']);
});

test('getRadarBadges returns Dip for sharp negative movers', () => {
  const badges = getRadarBadges(sampleItems[2], { volumeMedian: 100 });
  assert.deepEqual(badges, ['Dip']);
});

test('getRadarBadges keeps threshold boundary values badge-free', () => {
  const hotBoundary = getRadarBadges(
    { volume24hUsd: 200, change24hPercent: 30 },
    { volumeMedian: 100 },
  );
  const dipBoundary = getRadarBadges(
    { volume24hUsd: 200, change24hPercent: -20 },
    { volumeMedian: 100 },
  );

  assert.deepEqual(hotBoundary, []);
  assert.deepEqual(dipBoundary, []);
});
