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