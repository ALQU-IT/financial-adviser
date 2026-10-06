import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { AUTO_IGNORE_PATTERNS, SEED_CATEGORIES, SEED_RULES } from "./seed";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

declare global {
  // eslint-disable-next-line no-var
  var __faDb: ReturnType<typeof createDb> | undefined;
}

/**
 * Opens the database, turning the driver's opaque SQLITE_CANTOPEN into a
 * message that names the real problem: the mounted data directory is not
 * writable by the user the server runs as.
 */
function openDatabase(file: string): Database.Database {
  try {
    return new Database(file);
  } catch (err) {
    if ((err as { code?: string }).code !== "SQLITE_CANTOPEN") throw err;
    let owner = "";
    try {
      const st = fs.statSync(DATA_DIR);
      owner = ` (owned by ${st.uid}:${st.gid}, mode ${(st.mode & 0o777)
        .toString(8)
        .padStart(3, "0")})`;
    } catch {
      owner = " (missing)";
    }
    const me = `${process.getuid?.() ?? "?"}:${process.getgid?.() ?? "?"}`;
    throw new Error(
      `Cannot open the database at ${file}: ${DATA_DIR}${owner} is not writable by uid ${me}. ` +
        `Fix the host directory mounted there, e.g. "chown -R 568:568 <host dir>", ` +
        `or set PUID/PGID to a user that owns it.`,
      { cause: err }
    );
  }
}

function createDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = openDatabase(path.join(DATA_DIR, "finance.db"));
  // busy_timeout first: it must be active before the WAL conversion below,
  // which takes an exclusive lock and would otherwise fail with SQLITE_BUSY
  // when two processes (e.g. parallel build workers) bootstrap concurrently.
  // Generous during startup: under `next build` every core is busy and
  // several workers queue for the one bootstrap below.
  sqlite.pragma("busy_timeout = 30000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  bootstrap(sqlite);
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

/**
 * Create/upgrade the schema and seed data.
 *
 * Runs as ONE `BEGIN IMMEDIATE` transaction: it takes the write lock up
 * front, so concurrent bootstraps (`next build` runs several workers on the
 * same file) queue behind each other via busy_timeout instead of
 * interleaving. Otherwise two of them could both see a column missing and
 * both ALTER ("duplicate column name"), or a reader upgrading to a writer
 * would get SQLITE_BUSY immediately ("database is locked") — busy_timeout
 * does not apply to that upgrade.
 */
function bootstrap(sqlite: Database.Database) {
  // Fast path: an up-to-date database needs nothing, so don't take the
  // write lock at all — only the first of many concurrent workers then
  // makes the others wait. (RESET_2FA_USER must always run.)
  const current = () => sqlite.pragma("user_version", { simple: true }) === BOOTSTRAP_VERSION;
  if (current() && !process.env.RESET_2FA_USER?.trim()) return;
  sqlite
    .transaction(() => {
      // Re-check under the lock: another worker may have just finished.
      if (current() && !process.env.RESET_2FA_USER?.trim()) return;
      migrate(sqlite);
      sqlite.pragma(`user_version = ${BOOTSTRAP_VERSION}`);
    })
    .immediate();
}

/**
 * Identifies what migrate() produces: bump SCHEMA_REV when changing the
 * schema or migrations; seed data is hashed in, so editing seed.ts alone
 * also re-runs the (idempotent) bootstrap on existing databases.
 */
const SCHEMA_REV = 3;
const BOOTSTRAP_VERSION =
  parseInt(
    crypto
      .createHash("sha256")
      .update(
        JSON.stringify([SCHEMA_REV, SEED_CATEGORIES, SEED_RULES, AUTO_IGNORE_PATTERNS])
      )
      .digest("hex")
      .slice(0, 7),
    16
  ) || 1;

function migrate(sqlite: Database.Database) {
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

    -- Optional two-factor authentication (per user, off by default).
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id TEXT PRIMARY KEY, -- base64url credential ID
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key TEXT NOT NULL, -- base64url COSE key
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT, -- JSON array
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at INTEGER
    );
    -- Password accepted, second factor still outstanding.
    CREATE TABLE IF NOT EXISTS pending_logins (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      challenge TEXT
    );
    -- WebAuthn registration challenges, keyed by user.
    CREATE TABLE IF NOT EXISTS auth_challenges (
      key TEXT PRIMARY KEY,
      challenge TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  // Columns added after the first release: ALTER only when missing, so
  // existing databases upgrade in place.
  const userCols = new Set(
    (sqlite.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map(
      (c) => c.name
    )
  );
  if (!userCols.has("totp_secret"))
    sqlite.exec("ALTER TABLE users ADD COLUMN totp_secret TEXT");
  if (!userCols.has("totp_enabled"))
    sqlite.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0");
  if (!userCols.has("totp_last_step"))
    sqlite.exec("ALTER TABLE users ADD COLUMN totp_last_step INTEGER");

  // Ignored transactions (e.g. paying the card bill): listed, never counted.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ignore_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pattern TEXT NOT NULL, -- normalized merchant
      ignored INTEGER NOT NULL -- 1 = ignore, 0 = always count (overrides auto)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ignore_rules_user_pattern
      ON ignore_rules(user_id, pattern);
  `);
  const txCols = new Set(
    (sqlite.prepare("PRAGMA table_info(transactions)").all() as { name: string }[]).map(
      (c) => c.name
    )
  );
  if (!txCols.has("ignored")) {
    sqlite.exec("ALTER TABLE transactions ADD COLUMN ignored INTEGER NOT NULL DEFAULT 0");
    // One-time: card payments imported before this existed stop counting.
    const mark = sqlite.prepare(
      "UPDATE transactions SET ignored = 1 WHERE merchant_norm LIKE '%' || ? || '%'"
    );
    for (const pattern of AUTO_IGNORE_PATTERNS) mark.run(pattern);
  }

  // Lockout escape hatch for a self-hosted box: RESET_2FA_USER=<username>
  // clears that user's second factors on start (then remove the variable).
  const resetUser = process.env.RESET_2FA_USER?.trim();
  if (resetUser) {
    const u = sqlite
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(resetUser) as { id: number } | undefined;
    if (u) {
      sqlite
        .prepare(
          "UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL WHERE id = ?"
        )
        .run(u.id);
      sqlite.prepare("DELETE FROM webauthn_credentials WHERE user_id = ?").run(u.id);
      sqlite.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(u.id);
      sqlite.prepare("DELETE FROM pending_logins WHERE user_id = ?").run(u.id);
      console.warn(
        `financial-adviser: two-factor authentication reset for "${resetUser}" (RESET_2FA_USER). Remove the variable now.`
      );
    }
  }

  // Idempotent: INSERT OR IGNORE keyed on unique names, rules only seeded once.
  const insertCat = sqlite.prepare(
    "INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)"
  );
  const catIdByName = sqlite.prepare(
    "SELECT id FROM categories WHERE name = ?"
  );
  const seedRuleExists = sqlite.prepare(
    "SELECT 1 FROM rules WHERE source = 'seed' AND pattern = ? AND category_id = ?"
  );
  const insertRule = sqlite.prepare(
    "INSERT INTO rules (pattern, category_id, source) VALUES (?, ?, 'seed')"
  );
  {
    for (const cat of SEED_CATEGORIES) insertCat.run(cat.name, cat.color);
    // Per-pattern upsert so newly added seed rules also reach existing
    // databases on the next boot.
    for (const [category, patterns] of Object.entries(SEED_RULES)) {
      const row = catIdByName.get(category) as { id: number } | undefined;
      if (!row) continue;
      for (const pattern of patterns) {
        if (!seedRuleExists.get(pattern, row.id)) insertRule.run(pattern, row.id);
      }
    }
  }
}

export const db = globalThis.__faDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalThis.__faDb = db;

export { schema };
