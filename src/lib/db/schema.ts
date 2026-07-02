import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
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
