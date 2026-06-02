/**
 * Drizzle table + enum definitions mirroring the canonical §3.2 DDL EXACTLY (this
 * is the single source of truth; §11.2's variant names are dropped). Three tables:
 * users, sessions, credentials. The `credentials` table holds CIPHERTEXT ONLY in
 * discrete crypto-envelope columns — there is no plaintext column anywhere.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  customType,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/** Raw bytes column (AES-GCM ciphertext/iv/tag, token/ip hashes). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const credentialType = pgEnum("credential_type", ["github_oauth", "anthropic_byok"]);
export const credentialStatus = pgEnum("credential_status", ["active", "invalid", "revoked"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubUserId: bigint("github_user_id", { mode: "number" }).notNull().unique(),
  githubLogin: text("github_login").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ipHash: bytea("ip_hash"),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: credentialType("type").notNull(),
    // AES-256-GCM envelope (crypto.ts) — discrete columns, never a concatenated blob.
    ciphertext: bytea("ciphertext").notNull(),
    iv: bytea("iv").notNull(),
    authTag: bytea("auth_tag").notNull(),
    keyVersion: smallint("key_version").notNull().default(1),
    last4: char("last4", { length: 4 }), // display only
    status: credentialStatus("status").notNull().default("active"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique("credentials_user_type_uniq").on(t.userId, t.type),
    index("credentials_user_id_idx").on(t.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
export type CredentialKind = (typeof credentialType.enumValues)[number];
export type CredentialStatus = (typeof credentialStatus.enumValues)[number];
