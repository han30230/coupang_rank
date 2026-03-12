/**
 * TTL 캐시 유틸 (lru-cache)
 * - 쿠팡 API 호출 제한 대응: 검색/베스트/딥링크 결과 캐싱
 */

const { LRUCache } = require('lru-cache');

function createCache({ max = 500, ttlMs = 60_000 } = {}) {
  return new LRUCache({
    max,
    ttl: ttlMs,
    allowStale: false,
    updateAgeOnGet: false,
  });
}

module.exports = { createCache };

