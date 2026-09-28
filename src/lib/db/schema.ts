import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // Optional TOTP (authenticator app). The secret is stored while setup is
  // in progress; only totpEnabled makes it required at sign-in.
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  // Last accepted 30-second step, so a code cannot be replayed.
  totpLastStep: integer("totp_last_step"),
});

export const webauthnCredentials = sqliteTable("webauthn_credentials", {
  id: text("id").primaryKey(), // base64url credential ID
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(), // base64url
  counter: integer("counter").notNull().default(0),
  transports: text("transports"), // JSON array
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});

export const recoveryCodes = sqliteTable("recovery_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(), // sha256 hex
  usedAt: integer("used_at", { mode: "timestamp" }),
});

export const pendingLogins = sqliteTable("pending_logins", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  challenge: text("challenge"), // WebAuthn challenge for this login
});

export const authChallenges = sqliteTable("auth_challenges", {
  key: text("key").primaryKey(),
  challenge: text("challenge").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
});

export const rules = sqliteTable("rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Uppercase keyword matched with `contains` against the merchant string.
  pattern: text("pattern").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["seed", "user"] })
    .notNull()
    .default("user"),
  // User rules apply only to that user's imports; seed rules apply to all.
  userId: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
});

export const providerMappings = sqliteTable("provider_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // JSON: { dateCol, merchantCol, amountCol, dateFormat, expensesArePositive, hasHeader }
  mapping: text("mapping").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const statements = sqliteTable("statements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  filename: text("filename").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" }).notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  statementId: integer("statement_id")
    .notNull()
    .references(() => statements.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // ISO date string YYYY-MM-DD; month key is date.slice(0, 7).
  date: text("date").notNull(),
  merchant: text("merchant").notNull(),
  // Uppercased/squashed merchant used for rule matching and grouping.
  merchantNorm: text("merchant_norm").notNull(),
  // Signed integer cents; expenses are negative, refunds/income positive.
  amountCents: integer("amount_cents").notNull(),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
});
