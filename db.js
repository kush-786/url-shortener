import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, "links.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT    NOT NULL UNIQUE,
    url        TEXT    NOT NULL,
    user_id    TEXT,
    clicks     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_links_user ON links (user_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS clicks_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT    NOT NULL,
    user_id    TEXT,
    clicked_at TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_clicks_code ON clicks_log (code);
  CREATE INDEX IF NOT EXISTS idx_clicks_at ON clicks_log (clicked_at);
`);

export function createLink({ code, url, userId = null }) {
  const info = db
    .prepare(
      "INSERT INTO links (code, url, user_id, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(code, url, userId, new Date().toISOString());
  return getLinkById(info.lastInsertRowid);
}

export function getLinkByCode(code) {
  return db.prepare("SELECT * FROM links WHERE code = ?").get(code);
}

export function getLinkById(id) {
  return db.prepare("SELECT * FROM links WHERE id = ?").get(id);
}

export function incrementClicks(id, amount = 1) {
  return db
    .prepare("UPDATE links SET clicks = clicks + ? WHERE id = ?")
    .run(amount, id);
}

export function logClick(code, userId = null) {
  db.prepare("INSERT INTO clicks_log (code, user_id, clicked_at) VALUES (?, ?, ?)").run(
    code,
    userId,
    new Date().toISOString()
  );
}

export function dailyClicks(code, days = 14) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return db
    .prepare(
      `SELECT substr(clicked_at, 1, 10) AS date, COUNT(*) AS clicks
       FROM clicks_log WHERE code = ? AND clicked_at >= ?
       GROUP BY date ORDER BY date`
    )
    .all(code, since);
}

export function listLinks({ userId = null, limit = 100 } = {}) {
  if (userId === null) {
    return db
      .prepare("SELECT * FROM links ORDER BY id DESC LIMIT ?")
      .all(limit);
  }
  return db
    .prepare("SELECT * FROM links WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit);
}