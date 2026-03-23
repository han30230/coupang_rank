/**
 * Express 서버: 쿠팡 파트너스 API 프록시 + 정적 파일(프론트 빌드) 제공
 * - API 키는 환경변수만 사용. 클라이언트에 노출하지 않음.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { fetchProducts, fetchBestCategories } = require('./coupangApi');
const {
  getTrendingKeywords,
  getFavorites,
  getFavoriteById,
  upsertFavorite,
  deleteFavorite,
  insertPriceSnapshot,
  getLatestTwoSnapshots,
  getPriceHistory,
  insertUiEvent,
  getUiEventCounts,
  getUiEventVariantCounts,
  getRecentUiEvents,
  getUiKpi,
  getUiEventDailyTrend,
  getUiEventsForExport,
  getAdminActionImpact,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3025;

function toNumberOrDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getKpiThresholds() {
  return {
    outboundRateGood: toNumberOrDefault(process.env.KPI_OUTBOUND_RATE_GOOD, 8),
    outboundRateWarn: toNumberOrDefault(process.env.KPI_OUTBOUND_RATE_WARN, 4),
    recirculationRateGood: toNumberOrDefault(process.env.KPI_RECIRCULATION_RATE_GOOD, 20),
    recirculationRateWarn: toNumberOrDefault(process.env.KPI_RECIRCULATION_RATE_WARN, 10),
    outboundPerSessionGood: toNumberOrDefault(process.env.KPI_OUTBOUND_PER_SESSION_GOOD, 0.3),
    outboundPerSessionWarn: toNumberOrDefault(process.env.KPI_OUTBOUND_PER_SESSION_WARN, 0.15),
    significancePvHigh: toNumberOrDefault(process.env.KPI_SIGNIFICANCE_PV_HIGH, 500),
    significancePvMedium: toNumberOrDefault(process.env.KPI_SIGNIFICANCE_PV_MEDIUM, 200),
  };
}

function getThresholdsFingerprint(thresholds) {
  return JSON.stringify(thresholds);
}

const serverBootedAt = Date.now();

// CORS: 개발 시 클라이언트(Vite 등)에서 API 호출 허용
app.use(cors());
app.use(express.json());

// 빌드된 React 앱 제공 (npm run build 후)
const distPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

/**
 * GET /api/coupang/products?keyword=노트북
 * - keyword: 필수
 * - subId: 선택 (환경변수 COUPANG_SUB_ID 있으면 서버에서 기본값으로 사용 가능)
 * - limit: 선택 (요청 개수, API가 더 작은 최대치를 강제할 수 있음)
 */
app.get('/api/coupang/products', async (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  if (!keyword) {
    res.status(400).json({
      success: false,
      error: '검색어(keyword)를 입력해 주세요.',
      code: 'MISSING_KEYWORD',
    });
    return;
  }

  const subId = req.query.subId || process.env.COUPANG_SUB_ID || '';
  const limit = Number(req.query.limit || 0) || undefined;
  console.log('[API] 검색 요청 keyword=', keyword, 'subId=', subId || '(없음)', 'limit=', limit || '(default)');

  const result = await fetchProducts(keyword, subId, limit);

  if (!result.success) {
    const status =
      result.code === 'ENV_MISSING' ? 500 :
      result.code === 'AUTH_FAILED' || result.code === 'INVALID_SIGNATURE' ? 401 :
      result.code === 'NETWORK_ERROR' ? 502 : 400;
    res.status(status).json({
      success: false,
      error: result.error,
      code: result.code,
    });
    return;
  }

  res.json({
    success: true,
    products: result.products,
  });
});

/**
 * GET /api/coupang/products/best?categoryId=1016&limit=50
 * - 카테고리 베스트 상품 (최대 50개)
 * - categoryId: 필수 (예: 1016=가전디지털, 1001=여성패션)
 */
app.get('/api/coupang/products/best', async (req, res) => {
  const categoryId = (req.query.categoryId || '').trim();
  if (!categoryId) {
    res.status(400).json({
      success: false,
      error: 'categoryId를 입력해 주세요. (예: 1016, 1001)',
      code: 'MISSING_CATEGORY_ID',
    });
    return;
  }

  const subId = req.query.subId || process.env.COUPANG_SUB_ID || '';
  const limit = Number(req.query.limit) || 50;
  console.log('[API] 베스트 요청 categoryId=', categoryId, 'limit=', limit);

  const result = await fetchBestCategories(categoryId, subId, limit);

  if (!result.success) {
    const status =
      result.code === 'ENV_MISSING' ? 500 :
      result.code === 'AUTH_FAILED' || result.code === 'INVALID_SIGNATURE' ? 401 :
      result.code === 'NETWORK_ERROR' ? 502 : 400;
    res.status(status).json({
      success: false,
      error: result.error,
      code: result.code,
    });
    return;
  }

  res.json({
    success: true,
    products: result.products,
  });
});

/**
 * GET /api/trending-keywords?rangeHours=24&limit=10
 */
app.get('/api/trending-keywords', (req, res) => {
  const rangeHours = Math.max(1, Math.min(Number(req.query.rangeHours) || 24, 24 * 30));
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50));
  const rows = getTrendingKeywords(rangeHours, limit);
  res.json({ success: true, items: rows });
});

/**
 * GET /api/favorites
 * - 찜 목록 + 최신 가격/변동 방향 포함
 */
app.get('/api/favorites', (req, res) => {
  const favorites = getFavorites();
  const enriched = favorites.map((f) => {
    const snaps = getLatestTwoSnapshots(f.productId);
    const latest = snaps[0] || null;
    const prev = snaps[1] || null;
    const latestPrice = latest ? Number(latest.price) : null;
    const prevPrice = prev ? Number(prev.price) : null;
    let direction = 'same'; // up|down|same|unknown
    if (latestPrice == null || prevPrice == null) direction = 'unknown';
    else if (latestPrice > prevPrice) direction = 'up';
    else if (latestPrice < prevPrice) direction = 'down';
    return { ...f, latestPrice, prevPrice, direction, latestSeenAt: latest?.seenAt || null };
  });
  res.json({ success: true, items: enriched });
});

/**
 * POST /api/favorites
 * body: { action: 'toggle'|'add'|'remove', product: {productId,...} }
 */
app.post('/api/favorites', (req, res) => {
  const action = req.body?.action || 'toggle';
  const product = req.body?.product || {};
  const productId = String(product.productId || '').trim();
  if (!productId) {
    res.status(400).json({ success: false, error: 'productId가 필요합니다.' });
    return;
  }

  const exists = getFavoriteById(productId);
  if (action === 'remove' || (action === 'toggle' && exists)) {
    deleteFavorite(productId);
    res.json({ success: true, removed: true, productId });
    return;
  }

  const saved = upsertFavorite(product);
  res.json({ success: true, removed: false, item: saved });
});

/**
 * GET /api/favorites/:productId/history?limit=50
 */
app.get('/api/favorites/:productId/history', (req, res) => {
  const productId = String(req.params.productId || '').trim();
  if (!productId) {
    res.status(400).json({ success: false, error: 'productId가 필요합니다.' });
    return;
  }
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
  const history = getPriceHistory(productId, limit);
  res.json({ success: true, items: history });
});

/**
 * POST /api/ingestDisplayedProducts
 * body: { products: [{productId, productPrice, ...}, ...] }
 * - 화면에 표시된 상품 중, 찜한 상품만 price_snapshots에 기록 (추가 쿠팡 호출 없음)
 */
app.post('/api/ingestDisplayedProducts', (req, res) => {
  const products = Array.isArray(req.body?.products) ? req.body.products : [];
  let ingested = 0;
  for (const p of products) {
    const productId = String(p?.productId || '').trim();
    if (!productId) continue;
    const fav = getFavoriteById(productId);
    if (!fav) continue; // 찜한 상품만 기록
    const price = Number(p?.productPrice) || 0;
    insertPriceSnapshot(productId, price);
    ingested += 1;
  }
  res.json({ success: true, ingested });
});

/**
 * POST /api/events
 * body: { eventName, pagePath, sessionId, variant, params }
 */
app.post('/api/events', (req, res) => {
  const eventName = String(req.body?.eventName || '').trim();
  if (!eventName) {
    res.status(400).json({ success: false, error: 'eventName is required' });
    return;
  }
  try {
    insertUiEvent(eventName, {
      pagePath: req.body?.pagePath || '',
      sessionId: req.body?.sessionId || '',
      variant: req.body?.variant || '',
      params: req.body?.params || {},
    });
    res.json({ success: true });
  } catch (e) {
    console.error('[Events] insert failed:', e.message);
    res.status(500).json({ success: false, error: 'failed to store event' });
  }
});

/**
 * GET /api/events/summary?rangeHours=24&limit=30
 */
app.get('/api/events/summary', (req, res) => {
  const rangeHours = Math.max(1, Math.min(Number(req.query.rangeHours) || 24, 24 * 30));
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 200));
  const items = getUiEventCounts(rangeHours, limit);
  res.json({ success: true, items });
});

/**
 * GET /api/events/summary-by-variant?rangeHours=24&limit=200
 */
app.get('/api/events/summary-by-variant', (req, res) => {
  const rangeHours = Math.max(1, Math.min(Number(req.query.rangeHours) || 24, 24 * 30));
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 200, 1000));
  const items = getUiEventVariantCounts(rangeHours, limit);
  res.json({ success: true, items });
});

/**
 * GET /api/events/recent?limit=100
 */
app.get('/api/events/recent', (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
  const items = getRecentUiEvents(limit).map((row) => ({
    ...row,
    params: (() => {
      try {
        return row.payload ? JSON.parse(row.payload) : {};
      } catch {
        return {};
      }
    })(),
  }));
  res.json({ success: true, items });
});

/**
 * GET /api/events/kpi?rangeHours=24
 */
app.get('/api/events/kpi', (req, res) => {
  const rangeHours = Math.max(1, Math.min(Number(req.query.rangeHours) || 24, 24 * 30));
  const result = getUiKpi(rangeHours);
  res.json({ success: true, thresholds: getKpiThresholds(), ...result });
});

/**
 * GET /api/events/config
 */
app.get('/api/events/config', (req, res) => {
  const thresholds = getKpiThresholds();
  res.json({
    success: true,
    thresholds,
    fingerprint: getThresholdsFingerprint(thresholds),
    loadedAt: serverBootedAt,
  });
});

/**
 * GET /api/events/trend?days=7
 */
app.get('/api/events/trend', (req, res) => {
  const days = Math.max(1, Math.min(Number(req.query.days) || 7, 90));
  const items = getUiEventDailyTrend(days);
  res.json({ success: true, items });
});

/**
 * GET /api/events/export.csv?rangeHours=24&limit=5000
 */
app.get('/api/events/export.csv', (req, res) => {
  const rangeHours = Math.max(1, Math.min(Number(req.query.rangeHours) || 24, 24 * 30));
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 5000, 20000));
  const rows = getUiEventsForExport(rangeHours, limit);

  const escapeCsv = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = ['id', 'createdAt', 'createdAtIso', 'eventName', 'pagePath', 'sessionId', 'variant', 'payload'];
  const lines = [header.join(',')];
  for (const row of rows) {
    const line = [
      row.id,
      row.createdAt,
      new Date(Number(row.createdAt)).toISOString(),
      row.eventName,
      row.pagePath,
      row.sessionId,
      row.variant,
      row.payload || '{}',
    ].map(escapeCsv).join(',');
    lines.push(line);
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="events_${rangeHours}h.csv"`);
  res.send(lines.join('\n'));
});

/**
 * GET /api/events/admin-action-impact?action=open_variant_A&windowHours=24
 */
app.get('/api/events/admin-action-impact', (req, res) => {
  const action = String(req.query.action || '').trim();
  const windowHours = Math.max(1, Math.min(Number(req.query.windowHours) || 24, 24 * 7));
  if (!action) {
    res.status(400).json({ success: false, error: 'action is required' });
    return;
  }
  const impact = getAdminActionImpact(action, windowHours);
  if (!impact) {
    res.json({ success: true, found: false });
    return;
  }
  res.json({ success: true, found: true, impact });
});

// SPA: 빌드된 클라이언트 라우팅 (dist 있을 때만)
app.get('*', (req, res, next) => {
  if (!fs.existsSync(distPath)) return next();
  const indexHtml = path.join(distPath, 'index.html');
  res.sendFile(indexHtml);
});

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log('[Server] listening on http://localhost:' + PORT);
    if (!process.env.COUPANG_ACCESS_KEY || !process.env.COUPANG_SECRET_KEY) {
      console.warn('[Server] COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 가 설정되지 않았습니다. API 호출 시 오류가 발생합니다.');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('[Server] 포트 ' + PORT + ' 이(가) 이미 사용 중입니다.');
      console.error('해결: PowerShell에서 아래 명령으로 해당 프로세스를 종료하세요.');
      console.error('  netstat -ano | findstr :' + PORT);
      console.error('  taskkill /PID <PID번호> /F');
      process.exit(1);
    }
    throw err;
  });
}

module.exports = app;
