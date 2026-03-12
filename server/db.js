/**
 * SQLite (better-sqlite3) DB 초기화 및 쿼리 유틸
 * - favorites, search_events, price_snapshots 테이블 관리
 * - 단일 파일 DB (server/data.sqlite)
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data.sqlite');
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

    CREATE INDEX IF NOT EXISTS idx_search_events_createdAt ON search_events(createdAt);
    CREATE INDEX IF NOT EXISTS idx_search_events_keyword ON search_events(keyword);
    CREATE INDEX IF NOT EXISTS idx_price_snapshots_productId_seenAt ON price_snapshots(productId, seenAt);
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
};

