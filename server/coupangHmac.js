/**
 * 쿠팡 파트너스 API HMAC 서명 생성 유틸
 * - 인증 키는 이 파일에서 직접 사용하지 않고, 호출자가 전달한다.
 * - 서명 메시지: datetime + method + path + query (RFC2104 HMAC-SHA256)
 */

const crypto = require('crypto');

/** GMT 기준 yyMMdd'T'HHmmss'Z' 형식 */
function getSignedDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yy = String(now.getUTCFullYear()).slice(-2);
  const MM = pad(now.getUTCMonth() + 1);
  const dd = pad(now.getUTCDate());
  const HH = pad(now.getUTCHours());
  const mm = pad(now.getUTCMinutes());
  const ss = pad(now.getUTCSeconds());
  return `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;
}

/**
 * HMAC-SHA256 서명 생성 후 Authorization 헤더 문자열 반환
 * @param {string} method - HTTP 메서드 (예: 'GET')
 * @param {string} path - URI path (쿼리 없이, 예: '/v2/providers/.../search')
 * @param {string} queryString - 쿼리 문자열 (예: 'keyword=노트북&limit=10'). 없으면 ''
 * @param {string} accessKey - 쿠팡 Access Key
 * @param {string} secretKey - 쿠팡 Secret Key (로그에 절대 출력 금지)
 * @returns {string} Authorization 헤더 값
 */
function generateAuthorization(method, path, queryString, accessKey, secretKey) {
  const datetime = getSignedDate();
  const query = queryString || '';
  const message = datetime + method + path + query;

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message, 'utf8')
    .digest('hex');

  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

module.exports = {
  getSignedDate,
  generateAuthorization,
};
