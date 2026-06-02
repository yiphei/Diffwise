/**
 * LLMCredentialSource abstraction (§3.9). The pipeline never touches the
 * `credentials` table directly — it depends on this interface so a future
 * platform-managed/billed key tier slots in without pipeline changes. v1 wires
 * UserProvidedKeySource (BYOK). Keys are JIT-decrypted into request-scoped memory
 * and never logged or returned to the client.
 */
import { decrypt } from "@/server/crypto";
import { credentialStore, toEnvelope } from "@/server/credentials/store";

export interface ResolvedLLMKey {
  /** Plaintext Anthropic key — in-memory, request-scoped only. Never logged. */
  apiKey: string;
  source: "user_provided" | "platform_managed";
}

export interface LLMCredentialSource {
  /** Returns a JIT-decrypted key for this user, or throws NeedsAnthropicKeyError. */
  getAnthropicKey(userId: string): Promise<ResolvedLLMKey>;
}

/** Thrown when no usable (present + active) BYOK key exists for the user. The
 *  generate endpoint maps this to the NO_BYOK_KEY error so the UI prompts entry. */
export class NeedsAnthropicKeyError extends Error {
  constructor(message = "No active Anthropic API key for this user.") {
    super(message);
    this.name = "NeedsAnthropicKeyError";
  }
}

/** v1 implementation: bring-your-own Anthropic key (§3.9). */
export class UserProvidedKeySource implements LLMCredentialSource {
  async getAnthropicKey(userId: string): Promise<ResolvedLLMKey> {
    const row = await credentialStore.get(userId, "anthropic_byok");
    if (!row || row.status !== "active") {
      throw new NeedsAnthropicKeyError();
    }
    // JIT-decrypt in memory; AAD-bound to userId (crypto.ts throws on mismatch).
    const apiKey = decrypt(toEnvelope(row), userId);
    return { apiKey, source: "user_provided" };
  }
}

/** DEFERRED: platform-managed key, billed by Diffwise. Reads a server env var. */
export class PlatformManagedKeySource implements LLMCredentialSource {
  async getAnthropicKey(_userId: string): Promise<ResolvedLLMKey> {
    const apiKey = process.env.PLATFORM_ANTHROPIC_KEY;
    if (!apiKey) {
      throw new NeedsAnthropicKeyError("PLATFORM_ANTHROPIC_KEY is not configured.");
    }
    return { apiKey, source: "platform_managed" };
  }
}
