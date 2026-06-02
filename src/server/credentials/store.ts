/**
 * The ONLY module that reads/writes the `credentials` table (§3.6/§3.7). It maps
 * the discrete crypto-envelope columns (ciphertext/iv/auth_tag/key_version) to/from
 * the CipherEnvelope shape and enforces the UNIQUE(user_id,type) "one row per type
 * per user" rule via upsert (rotation overwrites in place). Never stores plaintext.
 */
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { credentials } from "@/server/db/schema";
import type { Credential, CredentialKind, CredentialStatus } from "@/server/db/schema";
import type { CipherEnvelope } from "@/server/crypto";

/** Map a stored row's bytea columns back into a CipherEnvelope for decrypt(). */
export function toEnvelope(row: Credential): CipherEnvelope {
  return {
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
    keyVersion: row.keyVersion,
  };
}

export const credentialStore = {
  /**
   * Insert or rotate-in-place the user's credential of `type`. On conflict against
   * UNIQUE(user_id,type), overwrites the envelope + last4 and resets status to
   * 'active' with a fresh validated_at/updated_at (§3.7 step 6).
   */
  async upsert(
    userId: string,
    type: CredentialKind,
    envelope: CipherEnvelope,
    last4: string,
  ): Promise<void> {
    await db
      .insert(credentials)
      .values({
        userId,
        type,
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        authTag: envelope.authTag,
        keyVersion: envelope.keyVersion,
        last4,
        status: "active",
        validatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [credentials.userId, credentials.type],
        set: {
          ciphertext: envelope.ciphertext,
          iv: envelope.iv,
          authTag: envelope.authTag,
          keyVersion: envelope.keyVersion,
          last4,
          status: "active",
          validatedAt: new Date(),
          updatedAt: sql`now()`,
        },
      });
  },

  /** Fetch a user's credential of `type`, or null. */
  async get(userId: string, type: CredentialKind): Promise<Credential | null> {
    const row = await db.query.credentials.findFirst({
      where: and(eq(credentials.userId, userId), eq(credentials.type, type)),
    });
    return row ?? null;
  },

  /** Delete (revoke) a user's credential of `type`. Idempotent. */
  async delete(userId: string, type: CredentialKind): Promise<void> {
    await db
      .delete(credentials)
      .where(and(eq(credentials.userId, userId), eq(credentials.type, type)));
  },

  /** Flip a credential's status (e.g. -> 'invalid' on upstream 401/403 at use). */
  async setStatus(userId: string, type: CredentialKind, status: CredentialStatus): Promise<void> {
    await db
      .update(credentials)
      .set({ status, updatedAt: sql`now()` })
      .where(and(eq(credentials.userId, userId), eq(credentials.type, type)));
  },
};
