import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { SEED_CATEGORIES, SEED_RULES } from "./seed";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

declare global {
  // eslint-disable-next-line no-var
  var __faDb: ReturnType<typeof createDb> | undefined;
}

function createDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, "finance.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  bootstrap(sqlite);
  return drizzle(sqlite, { schema });
}

function bootstrap(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'user',
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS provider_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mapping TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      filename TEXT NOT NULL,
      uploaded_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id INTEGER NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      merchant TEXT NOT NULL,
      merchant_norm TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  // Idempotent and safe under concurrent bootstrap (e.g. parallel build
  // workers): INSERT OR IGNORE keyed on unique names, rules only seeded once.
  const insertCat = sqlite.prepare(
    "INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)"
  );
  const catIdByName = sqlite.prepare(
    "SELECT id FROM categories WHERE name = ?"
  );
  const seedRuleCount = sqlite.prepare(
    "SELECT COUNT(*) AS n FROM rules WHERE source = 'seed'"
  );
  const insertRule = sqlite.prepare(
    "INSERT INTO rules (pattern, category_id, source) VALUES (?, ?, 'seed')"
  );
  const tx = sqlite.transaction(() => {
    for (const cat of SEED_CATEGORIES) insertCat.run(cat.name, cat.color);
    const count = seedRuleCount.get() as { n: number };
    if (count.n === 0) {
      for (const [category, patterns] of Object.entries(SEED_RULES)) {
        const row = catIdByName.get(category) as { id: number } | undefined;
        if (!row) continue;
        for (const pattern of patterns) insertRule.run(pattern, row.id);
      }
    }
  });
  tx();
}

export const db = globalThis.__faDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalThis.__faDb = db;

export { schema };
