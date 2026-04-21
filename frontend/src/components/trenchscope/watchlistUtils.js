export const WATCHLIST_STORAGE_KEY = 'trenchscope_watchlist';

function isValidType(type) {
  return type === 'token' || type === 'wallet';
}

function getTrimmedText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function isValidItem(item) {
  const lastCheckedAtIsValid =
    item && (item.lastCheckedAt === null || typeof item.lastCheckedAt === 'string');

  return (
    item &&
    isValidType(item.type) &&
    typeof item.address === 'string' &&
    item.address.trim() !== '' &&
    typeof item.label === 'string' &&
    item.label.trim() !== '' &&
    typeof item.addedAt === 'string' &&
    Object.prototype.hasOwnProperty.call(item, 'lastCheckedAt') &&
    lastCheckedAtIsValid
  );
}

export function loadWatchlistFromStorage(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isValidItem).map((item) => ({
      type: item.type,
      address: item.address.trim(),
      label: item.label,
      addedAt: item.addedAt,
      lastCheckedAt: item.lastCheckedAt ?? null,
    }));
  } catch {
    return [];
  }
}

export function saveWatchlistToStorage(items) {
  return JSON.stringify(Array.isArray(items) ? items : []);
}

export function findWatchItemIndex(items, target) {
  return (Array.isArray(items) ? items : []).findIndex(
    (item) => item.type === target.type && item.address === target.address,
  );
}

export function upsertWatchItem(items, nextItem) {
  const safeItems = Array.isArray(items) ? items : [];
  const index = findWatchItemIndex(safeItems, nextItem);

  if (index >= 0) {
    return safeItems;
  }

  return [nextItem, ...safeItems];
}

export function removeWatchItem(items, target) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => !(item.type === target.type && item.address === target.address),
  );
}

export function touchWatchItem(items, { type, address, checkedAt }) {
  return (Array.isArray(items) ? items : []).map((item) =>
    item.type === type && item.address === address
      ? { ...item, lastCheckedAt: checkedAt }
      : item,
  );
}

export function createTokenWatchItem({ address, overview, now, formatAddress }) {
  const name = getTrimmedText(overview?.name);
  const symbol = getTrimmedText(overview?.symbol);

  return {
    type: 'token',
    address,
    label: name || symbol || formatAddress(address),
    addedAt: now,
    lastCheckedAt: null,
  };
}

export function createWalletWatchItem({ address, now, formatAddress }) {
  return {
    type: 'wallet',
    address,
    label: formatAddress(address),
    addedAt: now,
    lastCheckedAt: null,
  };
}
