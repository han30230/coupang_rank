/**
 * 쿠팡 파트너스 Deeplink API: 상품 URL → 제휴 단축 링크(coupa.ng) 변환
 * - 이 링크를 통해 들어온 구매만 수수료가 발생합니다.
 */

const { generateAuthorization } = require('./coupangHmac');

const COUPANG_BASE_URL = process.env.COUPANG_BASE_URL || 'https://api-gateway.coupang.com';
const DEEPLINK_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

// 외부에서 주입 가능한 캐시(선택) - originalUrl -> shortenUrl
let deeplinkCache = null;
function setDeeplinkCache(cache) {
  deeplinkCache = cache;
}

/**
 * 쿠팡 URL 목록을 제휴 단축 링크로 변환
 * @param {string[]} coupangUrls - 변환할 쿠팡 상품/검색 URL 배열
 * @returns {Promise<{ success: boolean, links?: Array<{ originalUrl: string, shortenUrl: string }>, error?: string }>}
 */
async function convertToAffiliateLinks(coupangUrls) {
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!accessKey || !secretKey) {
    return { success: false, error: 'API 키 없음' };
  }
  if (!Array.isArray(coupangUrls) || coupangUrls.length === 0) {
    return { success: true, links: [] };
  }

  // 캐시 히트 먼저 처리
  const linksFromCache = [];
  const toRequest = [];
  for (const u of coupangUrls) {
    const cached = deeplinkCache ? deeplinkCache.get(u) : null;
    if (cached) linksFromCache.push({ originalUrl: u, shortenUrl: cached });
    else toRequest.push(u);
  }
  if (toRequest.length === 0) {
    return { success: true, links: linksFromCache };
  }

  const pathOnly = DEEPLINK_PATH;
  const queryString = '';
  const authorization = generateAuthorization('POST', pathOnly, queryString, accessKey, secretKey);
  const url = COUPANG_BASE_URL + DEEPLINK_PATH;
  const body = JSON.stringify({ coupangUrls: toRequest });

  console.log('[Deeplink API] 요청 URL 개수:', toRequest.length, '(cache hit:', linksFromCache.length + ')');

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body,
    });
  } catch (err) {
    console.error('[Deeplink API] 네트워크 오류:', err.message);
    return { success: false, error: err.message };
  }

  const text = await res.text();
  console.log('[Deeplink API] 응답 status:', res.status, 'body 일부:', text.slice(0, 300));

  if (res.status !== 200) {
    return { success: false, error: `Deeplink API ${res.status}: ${text.slice(0, 200)}` };
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { success: false, error: 'Deeplink 응답 JSON 파싱 실패' };
  }

  if (json.code === 'ERROR' || (json.rCode && json.rCode !== '0' && json.rCode !== 0)) {
    console.error('[Deeplink API] API 에러:', json.message || json.rMessage);
    return { success: false, error: json.message || json.rMessage || 'Deeplink 변환 실패' };
  }

  const data = json.data;
  const links = Array.isArray(data)
    ? data.map((item) => ({
        originalUrl: item.originalUrl || item.original_url || '',
        shortenUrl: item.shortenUrl || item.shorten_url || item.shortUrl || item.short_url || '',
      }))
    : [];

  // 캐시 저장
  if (deeplinkCache) {
    for (const l of links) {
      if (l.originalUrl && l.shortenUrl) deeplinkCache.set(l.originalUrl, l.shortenUrl);
    }
  }

  // 캐시 히트 + 이번 응답 병합
  return { success: true, links: [...linksFromCache, ...links] };
}

module.exports = { convertToAffiliateLinks, setDeeplinkCache };
