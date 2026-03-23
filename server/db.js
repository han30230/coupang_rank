/**
 * SQLite (better-sqlite3) DB 초기화 및 쿼리 유틸
 * - favorites, search_events, price_snapshots 테이블 관리
 * - 단일 파일 DB (server/data.sqlite)
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'data.sqlite')
  : path.join(__dirname, 'data.sqlite');
const db = new Database(DB_PATH);

// 성능/안정성 설정
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      productId TEXT PRIMARY KEY,
      productName TEXT,
      productImage TEXT,
      productUrl TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId TEXT NOT NULL,
      price REAL NOT NULL,
      seenAt INTEGER NOT NULL,
      FOREIGN KEY(productId) REFERENCES favorites(productId) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ui_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eventName TEXT NOT NULL,
      pagePath TEXT,
      sessionId TEXT,
      variant TEXT,
      payload TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_search_events_createdAt ON search_events(createdAt);
    CREATE INDEX IF NOT EXISTS idx_search_events_keyword ON search_events(keyword);
    CREATE INDEX IF NOT EXISTS idx_price_snapshots_productId_seenAt ON price_snapshots(productId, seenAt);
    CREATE INDEX IF NOT EXISTS idx_ui_events_createdAt ON ui_events(createdAt);
    CREATE INDEX IF NOT EXISTS idx_ui_events_eventName ON ui_events(eventName);
  `);
}

migrate();

function nowMs() {
  return Date.now();
}

// --- search events ---
const insertSearchEventStmt = db.prepare(
  `INSERT INTO search_events(keyword, createdAt) VALUES (?, ?)`
);
function insertSearchEvent(keyword) {
  insertSearchEventStmt.run(keyword, nowMs());
}

const trendingKeywordsStmt = db.prepare(`
  SELECT keyword, COUNT(*) as cnt
  FROM search_events
  WHERE createdAt >= ?
  GROUP BY keyword
  ORDER BY cnt DESC
  LIMIT ?
`);
function getTrendingKeywords(rangeHours = 24, limit = 10) {
  const since = nowMs() - rangeHours * 60 * 60 * 1000;
  return trendingKeywordsStmt.all(since, limit);
}

// --- favorites ---
const getFavoritesStmt = db.prepare(`
  SELECT productId, productName, productImage, productUrl, createdAt
  FROM favorites
  ORDER BY createdAt DESC
`);
function getFavorites() {
  return getFavoritesStmt.all();
}

const getFavoriteByIdStmt = db.prepare(`SELECT * FROM favorites WHERE productId = ?`);
function getFavoriteById(productId) {
  return getFavoriteByIdStmt.get(String(productId));
}

const upsertFavoriteStmt = db.prepare(`
  INSERT INTO favorites(productId, productName, productImage, productUrl, createdAt)
  VALUES (@productId, @productName, @productImage, @productUrl, @createdAt)
  ON CONFLICT(productId) DO UPDATE SET
    productName=excluded.productName,
    productImage=excluded.productImage,
    productUrl=excluded.productUrl
`);
function upsertFavorite(product) {
  const payload = {
    productId: String(product.productId || ''),
    productName: product.productName || '',
    productImage: product.productImage || '',
    productUrl: product.productUrl || '',
    createdAt: nowMs(),
  };
  if (!payload.productId) throw new Error('productId is required');
  upsertFavoriteStmt.run(payload);
  return getFavoriteById(payload.productId);
}

const deleteFavoriteStmt = db.prepare(`DELETE FROM favorites WHERE productId = ?`);
function deleteFavorite(productId) {
  return deleteFavoriteStmt.run(String(productId));
}

// --- price snapshots ---
const insertSnapshotStmt = db.prepare(`
  INSERT INTO price_snapshots(productId, price, seenAt)
  VALUES (?, ?, ?)
`);
function insertPriceSnapshot(productId, price) {
  insertSnapshotStmt.run(String(productId), Number(price) || 0, nowMs());
}

const latestTwoSnapshotsStmt = db.prepare(`
  SELECT price, seenAt
  FROM price_snapshots
  WHERE productId = ?
  ORDER BY seenAt DESC
  LIMIT 2
`);
function getLatestTwoSnapshots(productId) {
  return latestTwoSnapshotsStmt.all(String(productId));
}

const historySnapshotsStmt = db.prepare(`
  SELECT price, seenAt
  FROM price_snapshots
  WHERE productId = ?
  ORDER BY seenAt DESC
  LIMIT ?
`);
function getPriceHistory(productId, limit = 50) {
  return historySnapshotsStmt.all(String(productId), limit);
}

// --- ui events ---
const insertUiEventStmt = db.prepare(`
  INSERT INTO ui_events(eventName, pagePath, sessionId, variant, payload, createdAt)
  VALUES (@eventName, @pagePath, @sessionId, @variant, @payload, @createdAt)
`);
function insertUiEvent(eventName, payload = {}) {
  const safeName = String(eventName || '').trim();
  if (!safeName) return;
  const record = {
    eventName: safeName,
    pagePath: String(payload.pagePath || ''),
    sessionId: String(payload.sessionId || ''),
    variant: String(payload.variant || ''),
    payload: JSON.stringify(payload.params || {}),
    createdAt: nowMs(),
  };
  insertUiEventStmt.run(record);
}

const uiEventCountsStmt = db.prepare(`
  SELECT eventName, COUNT(*) as cnt
  FROM ui_events
  WHERE createdAt >= ?
  GROUP BY eventName
  ORDER BY cnt DESC
  LIMIT ?
`);
function getUiEventCounts(rangeHours = 24, limit = 50) {
  const since = nowMs() - rangeHours * 60 * 60 * 1000;
  return uiEventCountsStmt.all(since, limit);
}

const uiEventVariantCountsStmt = db.prepare(`
  SELECT eventName, COALESCE(NULLIF(variant, ''), 'N/A') as variant, COUNT(*) as cnt
  FROM ui_events
  WHERE createdAt >= ?
  GROUP BY eventName, variant
  ORDER BY eventName ASC, cnt DESC
  LIMIT ?
`);
function getUiEventVariantCounts(rangeHours = 24, limit = 200) {
  const since = nowMs() - rangeHours * 60 * 60 * 1000;
  return uiEventVariantCountsStmt.all(since, limit);
}

const recentUiEventsStmt = db.prepare(`
  SELECT id, eventName, pagePath, sessionId, variant, payload, createdAt
  FROM ui_events
  ORDER BY createdAt DESC
  LIMIT ?
`);
function getRecentUiEvents(limit = 100) {
  return recentUiEventsStmt.all(Math.max(1, Math.min(Number(limit) || 100, 500)));
}

function getUiKpi(rangeHours = 24) {
  const since = nowMs() - rangeHours * 60 * 60 * 1000;

  const totals = db.prepare(`
    SELECT
      COUNT(*) as totalEvents,
      COUNT(DISTINCT sessionId) as totalSessions,
      SUM(CASE WHEN eventName='page_view' THEN 1 ELSE 0 END) as pageViews,
      SUM(CASE WHEN eventName='product_outbound_click' THEN 1 ELSE 0 END) as outboundClicks,
      SUM(CASE WHEN eventName IN (
        'section_keyword_click',
        'category_click',
        'price_bucket_click',
        'trending_keyword_click',
        'landing_route_click'
      ) THEN 1 ELSE 0 END) as recirculationClicks
    FROM ui_events
    WHERE createdAt >= ?
  `).get(since);

  const byVariant = db.prepare(`
    SELECT
      COALESCE(NULLIF(variant, ''), 'N/A') as variant,
      COUNT(*) as totalEvents,
      COUNT(DISTINCT sessionId) as totalSessions,
      SUM(CASE WHEN eventName='page_view' THEN 1 ELSE 0 END) as pageViews,
      SUM(CASE WHEN eventName='product_outbound_click' THEN 1 ELSE 0 END) as outboundClicks,
      SUM(CASE WHEN eventName IN (
        'section_keyword_click',
        'category_click',
        'price_bucket_click',
        'trending_keyword_click',
        'landing_route_click'
      ) THEN 1 ELSE 0 END) as recirculationClicks
    FROM ui_events
    WHERE createdAt >= ?
    GROUP BY COALESCE(NULLIF(variant, ''), 'N/A')
    ORDER BY totalEvents DESC
  `).all(since);

  return { totals, byVariant };
}

function getUiEventDailyTrend(days = 7) {
  const safeDays = Math.max(1, Math.min(Number(days) || 7, 90));
  const since = nowMs() - safeDays * 24 * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', datetime(createdAt / 1000, 'unixepoch', 'localtime')) as day,
      COUNT(*) as totalEvents,
      COUNT(DISTINCT sessionId) as totalSessions,
      SUM(CASE WHEN eventName='page_view' THEN 1 ELSE 0 END) as pageViews,
      SUM(CASE WHEN eventName='product_outbound_click' THEN 1 ELSE 0 END) as outboundClicks,
      SUM(CASE WHEN eventName IN (
        'section_keyword_click',
        'category_click',
        'price_bucket_click',
        'trending_keyword_click',
        'landing_route_click'
      ) THEN 1 ELSE 0 END) as recirculationClicks
    FROM ui_events
    WHERE createdAt >= ?
    GROUP BY day
    ORDER BY day ASC
  `).all(since);
  return rows;
}

function getUiEventsForExport(rangeHours = 24, limit = 2000) {
  const safeHours = Math.max(1, Math.min(Number(rangeHours) || 24, 24 * 30));
  const safeLimit = Math.max(1, Math.min(Number(limit) || 2000, 20000));
  const since = nowMs() - safeHours * 60 * 60 * 1000;
  return db.prepare(`
    SELECT id, eventName, pagePath, sessionId, variant, payload, createdAt
    FROM ui_events
    WHERE createdAt >= ?
    ORDER BY createdAt DESC
    LIMIT ?
  `).all(since, safeLimit);
}

function getKpiBetween(startMs, endMs) {
  return db.prepare(`
    SELECT
      COUNT(*) as totalEvents,
      COUNT(DISTINCT sessionId) as totalSessions,
      SUM(CASE WHEN eventName='page_view' THEN 1 ELSE 0 END) as pageViews,
      SUM(CASE WHEN eventName='product_outbound_click' THEN 1 ELSE 0 END) as outboundClicks,
      SUM(CASE WHEN eventName IN (
        'section_keyword_click',
        'category_click',
        'price_bucket_click',
        'trending_keyword_click',
        'landing_route_click'
      ) THEN 1 ELSE 0 END) as recirculationClicks
    FROM ui_events
    WHERE createdAt >= ? AND createdAt < ?
  `).get(startMs, endMs);
}

function getAdminActionImpact(action, windowHours = 24) {
  const safeAction = String(action || '').trim();
  if (!safeAction) return null;
  const safeWindowMs = Math.max(1, Math.min(Number(windowHours) || 24, 24 * 7)) * 60 * 60 * 1000;
  const latest = db.prepare(`
    SELECT createdAt, payload
    FROM ui_events
    WHERE eventName='admin_action_click'
      AND json_extract(payload, '$.action') = ?
    ORDER BY createdAt DESC
    LIMIT 1
  `).get(safeAction);
  if (!latest) return null;

  const pivot = Number(latest.createdAt);
  const beforeStart = pivot - safeWindowMs;
  const beforeEnd = pivot;
  const afterStart = pivot;
  const afterEnd = Math.min(pivot + safeWindowMs, nowMs());

  const before = getKpiBetween(beforeStart, beforeEnd);
  const after = getKpiBetween(afterStart, afterEnd);
  return {
    action: safeAction,
    pivotAt: pivot,
    windowHours: safeWindowMs / (60 * 60 * 1000),
    before,
    after,
  };
}

module.exports = {
  db,
  insertSearchEvent,
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
};

