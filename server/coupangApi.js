/**
 * 쿠팡 파트너스 API 호출 (서버 전용)
 * - 키는 환경변수에서만 읽는다.
 * - 상품 검색 결과를 안전하게 매핑하고, fallback 처리한다.
 * - 검색 API의 productUrl은 일반 URL이므로, Deeplink API로 제휴 링크(수수료 트래킹)로 변환한다.
 */

const { generateAuthorization } = require('./coupangHmac');
const { convertToAffiliateLinks, setDeeplinkCache } = require('./coupangDeeplink');
const { createCache } = require('./cache');
const { insertSearchEvent } = require('./db');

// 환경변수로 관리 (base URL 변경 가능)
const COUPANG_BASE_URL = process.env.COUPANG_BASE_URL || 'https://api-gateway.coupang.com';
const SEARCH_PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';
const BEST_CATEGORIES_PATH_PREFIX = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/';

// 검색 API: limit 상한이 10으로 제한됨
const SEARCH_DEFAULT_LIMIT = 10;
const SEARCH_MAX_LIMIT = 10;
// 카테고리 베스트 API: 최대 50개까지 요청 가능
const BEST_DEFAULT_LIMIT = 50;
const BEST_MAX_LIMIT = 50;

// 캐시: 쿠팡 호출 제한 대응
// - searchCache: keyword+subId+limit -> products
// - bestCache: categoryId+subId+limit -> products
// - deeplinkCache: originalUrl -> shortenUrl (coupangDeeplink에서 사용)
const searchCache = createCache({ max: 300, ttlMs: 60_000 }); // 60s
const bestCache = createCache({ max: 300, ttlMs: 60_000 }); // 60s
const deeplinkCache = createCache({ max: 2000, ttlMs: 24 * 60 * 60 * 1000 }); // 24h
setDeeplinkCache(deeplinkCache);

/**
 * 이미 제휴 링크이거나(또는 Deeplink 변환이 필요없는) URL인지 판별
 * - link.coupang.com/re/... : 파트너스 제휴 링크
 * - coupa.ng/...           : 파트너스 단축 링크
 */
function isAlreadyAffiliateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('link.coupang.com/re/') || url.includes('coupa.ng/');
}

/**
 * 검색 키워드로 상품 목록 조회
 * @param {string} keyword - 검색어
 * @param {string} [subId] - 서브 ID (선택)
 * @param {number} [limit] - 요청할 상품 개수(최대치가 API에 의해 제한될 수 있음)
 * @returns {Promise<{ success: boolean, products?: Array, error?: string, code?: string }>}
 */
async function fetchProducts(keyword, subId = '', limit = SEARCH_DEFAULT_LIMIT) {
  const requestedLimit = Number(limit) || SEARCH_DEFAULT_LIMIT;
  const safeLimit = Math.max(1, Math.min(requestedLimit, SEARCH_MAX_LIMIT));
  if (requestedLimit !== safeLimit) {
    console.warn('[Coupang API] limit 조정:', requestedLimit, '->', safeLimit, '(검색 API 제한)');
  }

  // 검색 이벤트 기록 (인기 키워드 집계용)
  try {
    insertSearchEvent(keyword);
  } catch (e) {
    console.warn('[DB] search_events 기록 실패:', e.message);
  }

  const cacheKey = `search:${keyword}|${subId}|${safeLimit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    console.log('[Coupang API] 검색 캐시 히트:', cacheKey);
    return { success: true, products: cached };
  }
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!accessKey || !secretKey) {
    console.error('[Coupang API] 환경변수 누락: COUPANG_ACCESS_KEY 또는 COUPANG_SECRET_KEY 없음');
    return { success: false, error: '서버 설정 오류: API 키가 설정되지 않았습니다.', code: 'ENV_MISSING' };
  }

  const params = new URLSearchParams();
  params.set('keyword', keyword);
  params.set('limit', String(safeLimit));
  if (subId) params.set('subId', subId);

  const queryString = params.toString();
  const pathOnly = SEARCH_PATH;

  const authorization = generateAuthorization('GET', pathOnly, queryString, accessKey, secretKey);
  const url = COUPANG_BASE_URL + SEARCH_PATH + '?' + queryString;

  console.log('[Coupang API] 요청 path:', pathOnly);
  console.log('[Coupang API] query string:', queryString);
  console.log('[Coupang API] full URL (키 제외):', url.replace(accessKey, '***'));

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    });
  } catch (err) {
    console.error('[Coupang API] 네트워크 오류:', err.message);
    return { success: false, error: '쿠팡 API 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: 'NETWORK_ERROR' };
  }

  const status = res.status;
  const text = await res.text();
  console.log('[Coupang API] 응답 status:', status);
  console.log('[Coupang API] 응답 body 일부:', text.slice(0, 500));

  if (status === 401) {
    console.error('[Coupang API] 인증 실패 (401). Access Key / Secret Key 또는 서명 확인.');
    return { success: false, error: 'API 인증에 실패했습니다. 관리자에게 문의하세요.', code: 'AUTH_FAILED' };
  }
  if (status === 403) {
    console.error('[Coupang API] 권한 없음 (403)');
    return { success: false, error: 'API 접근 권한이 없습니다.', code: 'FORBIDDEN' };
  }
  if (status !== 200) {
    console.error('[Coupang API] 예상 외 상태:', status, text.slice(0, 300));
    return { success: false, error: `API 오류가 발생했습니다. (${status})`, code: 'API_ERROR' };
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    console.error('[Coupang API] 응답 JSON 파싱 실패:', e.message);
    return { success: false, error: 'API 응답 형식이 올바르지 않습니다.', code: 'INVALID_RESPONSE' };
  }

  if (json.code === 'ERROR') {
    const msg = json.message || 'Unknown error';
    console.error('[Coupang API] API 에러 응답:', msg, json.transactionId || '');
    if (msg.includes('signature')) {
      return { success: false, error: 'API 인증 서명 오류입니다. Secret Key를 확인하세요.', code: 'INVALID_SIGNATURE' };
    }
    if (msg.includes('Unknown error')) {
      return { success: false, error: 'API 인증 실패(Access Key 확인).', code: 'AUTH_FAILED' };
    }
    return { success: false, error: msg, code: 'API_ERROR' };
  }

  const rCode = json.rCode;
  const rMessage = json.rMessage || '';
  if (rCode !== '0' && rCode !== 0) {
    console.error('[Coupang API] rCode 비정상:', rCode, rMessage);
    return { success: false, error: rMessage || '검색 처리 중 오류가 발생했습니다.', code: 'RCODE_ERROR' };
  }

  const data = json.data;
  if (!data) {
    console.log('[Coupang API] data 없음. 응답 구조 확인 필요.');
    return { success: true, products: [] };
  }

  const productData = data.productData || data.productDataList || [];
  if (!Array.isArray(productData)) {
    console.error('[Coupang API] productData가 배열이 아님:', typeof productData);
    return { success: true, products: [] };
  }

  let products = productData.slice(0, safeLimit).map((item) => ({
    productId: item.productId ?? item.product_id ?? '',
    productName: item.productName ?? item.product_name ?? '상품명 없음',
    productPrice: item.productPrice ?? item.product_price ?? 0,
    productImage: item.productImage ?? item.product_image ?? '',
    productUrl: item.productUrl ?? item.product_url ?? item.link ?? '',
    rank: item.rank ?? null,
    isRocket: item.isRocket ?? item.is_rocket ?? null,
    isFreeShipping: item.isFreeShipping ?? item.is_free_shipping ?? null,
  }));

  // 검색 API는 환경/정책에 따라 이미 제휴 링크(productUrl이 link.coupang.com/re/...)를 줄 수 있음
  // 이 경우 Deeplink 변환을 시도하면 "url convert failed"가 날 수 있으므로 건너뛴다.
  const urlsToConvert = products
    .map((p) => p.productUrl)
    .filter((u) => u && u.startsWith('http') && !isAlreadyAffiliateUrl(u));
  if (urlsToConvert.length > 0) {
    const deeplinkResult = await convertToAffiliateLinks(urlsToConvert);
    if (deeplinkResult.success && deeplinkResult.links && deeplinkResult.links.length > 0) {
      const urlMap = new Map(deeplinkResult.links.map((l) => [l.originalUrl, l.shortenUrl]));
      const byIndex = deeplinkResult.links;
      products = products.map((p, i) => {
        const affiliateUrl = urlMap.get(p.productUrl) || (byIndex[i] && byIndex[i].shortenUrl) || p.productUrl;
        return { ...p, productUrl: affiliateUrl };
      });
      console.log('[Coupang API] 제휴 링크 변환 완료:', deeplinkResult.links.length, '건');
    } else {
      console.warn('[Coupang API] Deeplink 변환 실패, 원본 URL 유지:', deeplinkResult.error);
    }
  }

  console.log('[Coupang API] 검색 상품 개수:', products.length);
  searchCache.set(cacheKey, products);
  return { success: true, products };
}

/**
 * 카테고리 베스트 상품 목록 조회 (최대 50개까지 요청 가능)
 * @param {string} categoryId - 카테고리 ID (예: 1016=가전디지털, 1001=여성패션)
 * @param {string} [subId] - 서브 ID (선택)
 * @param {number} [limit] - 요청 개수 (최대 50)
 * @returns {Promise<{ success: boolean, products?: Array, error?: string, code?: string }>}
 */
async function fetchBestCategories(categoryId, subId = '', limit = BEST_DEFAULT_LIMIT) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || BEST_DEFAULT_LIMIT, BEST_MAX_LIMIT));

  const cacheKey = `best:${categoryId}|${subId}|${safeLimit}`;
  const cached = bestCache.get(cacheKey);
  if (cached) {
    console.log('[Coupang API] 베스트 캐시 히트:', cacheKey);
    return { success: true, products: cached };
  }
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!accessKey || !secretKey) {
    console.error('[Coupang API] 환경변수 누락: COUPANG_ACCESS_KEY 또는 COUPANG_SECRET_KEY 없음');
    return { success: false, error: '서버 설정 오류: API 키가 설정되지 않았습니다.', code: 'ENV_MISSING' };
  }

  const pathOnly = BEST_CATEGORIES_PATH_PREFIX + String(categoryId).trim();
  const params = new URLSearchParams();
  params.set('limit', String(safeLimit));
  if (subId) params.set('subId', subId);
  const queryString = params.toString();
  const fullPath = queryString ? pathOnly + '?' + queryString : pathOnly;
  const authorization = generateAuthorization('GET', pathOnly, queryString, accessKey, secretKey);
  const url = COUPANG_BASE_URL + fullPath;

  console.log('[Coupang API] 베스트 요청 path:', pathOnly, 'query:', queryString);

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    });
  } catch (err) {
    console.error('[Coupang API] 네트워크 오류:', err.message);
    return { success: false, error: '쿠팡 API 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: 'NETWORK_ERROR' };
  }

  const text = await res.text();
  console.log('[Coupang API] 베스트 응답 status:', res.status, 'body 일부:', text.slice(0, 400));

  if (res.status === 401) {
    return { success: false, error: 'API 인증에 실패했습니다.', code: 'AUTH_FAILED' };
  }
  if (res.status === 403) {
    return { success: false, error: 'API 접근 권한이 없습니다.', code: 'FORBIDDEN' };
  }
  if (res.status !== 200) {
    return { success: false, error: `API 오류가 발생했습니다. (${res.status})`, code: 'API_ERROR' };
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { success: false, error: 'API 응답 형식이 올바르지 않습니다.', code: 'INVALID_RESPONSE' };
  }

  if (json.code === 'ERROR') {
    return { success: false, error: json.message || 'API 오류', code: 'API_ERROR' };
  }
  const rCode = json.rCode;
  if (rCode !== '0' && rCode !== 0) {
    return { success: false, error: json.rMessage || '베스트 조회 실패', code: 'RCODE_ERROR' };
  }

  const data = json.data;
  if (!data) {
    return { success: true, products: [] };
  }

  // bestcategories 응답은 data가 "배열"로 오는 케이스가 존재함 (로그 확인됨)
  // 환경/버전에 따라 data가 객체로 오면서 내부에 배열을 담는 케이스도 있어 방어적으로 처리한다.
  let productData = [];
  if (Array.isArray(data)) {
    productData = data;
  } else if (data && Array.isArray(data.data)) {
    productData = data.data;
  } else if (data && Array.isArray(data.productData)) {
    productData = data.productData;
  } else if (data && Array.isArray(data.productDataList)) {
    productData = data.productDataList;
  }

  if (!Array.isArray(productData)) {
    console.error('[Coupang API] 베스트 응답 data 포맷 예상과 다름:', typeof data, Object.keys(data || {}));
    return { success: true, products: [] };
  }

  if (productData.length === 0) {
    console.warn('[Coupang API] 베스트 productData가 0건입니다. data 타입/키:', Array.isArray(data) ? 'array' : typeof data, Object.keys(data || {}));
  }

  let products = productData.slice(0, safeLimit).map((item) => ({
    productId: item.productId ?? item.product_id ?? '',
    productName: item.productName ?? item.product_name ?? '상품명 없음',
    productPrice: item.productPrice ?? item.product_price ?? 0,
    productImage: item.productImage ?? item.product_image ?? '',
    productUrl: item.productUrl ?? item.product_url ?? item.link ?? '',
    rank: item.rank ?? null,
    isRocket: item.isRocket ?? item.is_rocket ?? null,
    isFreeShipping: item.isFreeShipping ?? item.is_free_shipping ?? null,
  }));

  // bestcategories는 이미 link.coupang.com/re/... 형태의 제휴 링크를 주는 케이스가 많음
  // 이미 제휴 링크면 변환하지 않는다.
  const urlsToConvert = products
    .map((p) => p.productUrl)
    .filter((u) => u && u.startsWith('http') && !isAlreadyAffiliateUrl(u));
  if (urlsToConvert.length > 0) {
    const deeplinkResult = await convertToAffiliateLinks(urlsToConvert);
    if (deeplinkResult.success && deeplinkResult.links && deeplinkResult.links.length > 0) {
      const urlMap = new Map(deeplinkResult.links.map((l) => [l.originalUrl, l.shortenUrl]));
      const byIndex = deeplinkResult.links;
      products = products.map((p, i) => ({
        ...p,
        productUrl: urlMap.get(p.productUrl) || (byIndex[i] && byIndex[i].shortenUrl) || p.productUrl,
      }));
      console.log('[Coupang API] 베스트 제휴 링크 변환 완료:', deeplinkResult.links.length, '건');
    }
  }

  console.log('[Coupang API] 베스트 상품 개수:', products.length);
  bestCache.set(cacheKey, products);
  return { success: true, products };
}

module.exports = { fetchProducts, fetchBestCategories };
