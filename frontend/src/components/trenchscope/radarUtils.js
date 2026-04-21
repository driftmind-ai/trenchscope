export function getMedian(values) {
  const validValues = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (validValues.length === 0) {
    return null;
  }

  const middleIndex = Math.floor(validValues.length / 2);

  if (validValues.length % 2 === 1) {
    return validValues[middleIndex];
  }

  return (validValues[middleIndex - 1] + validValues[middleIndex]) / 2;
}

export function getRadarBadges(item, { volumeMedian } = {}) {
  const badges = [];

  if (
    Number.isFinite(item?.volume24hUsd)
    && Number.isFinite(volumeMedian)
    && item.volume24hUsd > volumeMedian * 2
  ) {
    badges.push('Hot');
  }

  if (Number.isFinite(item?.change24hPercent) && item.change24hPercent > 30) {
    badges.push('Pump');
  }

  if (Number.isFinite(item?.change24hPercent) && item.change24hPercent < -20) {
    badges.push('Dip');
  }

  return badges;
}

export function normalizeQuery(query) {
  return String(query ?? '').trim().toLowerCase();
}

export function getMetricValue(item, sortMetric) {
  if (sortMetric === 'change24hPercent') {
    return Number.isFinite(item?.change24hPercent) ? item.change24hPercent : null;
  }

  if (sortMetric === 'volume24hUsd') {
    return Number.isFinite(item?.volume24hUsd) ? item.volume24hUsd : null;
  }

  if (sortMetric === 'marketCap') {
    return Number.isFinite(item?.marketCap) ? item.marketCap : null;
  }

  return null;
}

export function deriveRadarItems(items, { query = '', sortMetric = null } = {}) {
  const normalizedQuery = normalizeQuery(query);
  const normalizedItems = (Array.isArray(items) ? items : []).map((item, index) => ({
    ...item,
    __originalIndex: index,
  }));

  const filteredItems = normalizedItems.filter((item) => {
      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [item?.name, item?.symbol]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!searchableText) {
        return false;
      }

      return searchableText.includes(normalizedQuery);
    });

  const volumeMedian = getMedian(normalizedItems.map((item) => item.volume24hUsd));

  const sortedItems = sortMetric
    ? [...filteredItems].sort((left, right) => {
        const leftValue = getMetricValue(left, sortMetric);
        const rightValue = getMetricValue(right, sortMetric);

        if (leftValue === null && rightValue === null) {
          return left.__originalIndex - right.__originalIndex;
        }

        if (leftValue === null) {
          return 1;
        }

        if (rightValue === null) {
          return -1;
        }

        if (rightValue !== leftValue) {
          return rightValue - leftValue;
        }

        return left.__originalIndex - right.__originalIndex;
      })
    : filteredItems;

  return {
    items: sortedItems.map(({ __originalIndex, ...item }) => item),
    volumeMedian,
  };
}
