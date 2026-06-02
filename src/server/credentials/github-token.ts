/**
 * JIT-decrypt the user's GitHub OAuth token for an outbound GitHub call.
 * In-memory, request-scoped only; never logged (§3.10).
 */
import { DiffwiseError } from "@/lib/model/errors";
import { decrypt } from "@/server/crypto";
import { credentialStore, toEnvelope } from "@/server/credentials/store";

export async function getGithubToken(userId: string): Promise<string> {
  const row = await credentialStore.get(userId, "github_oauth");
  if (!row || row.status !== "active") {
    throw new DiffwiseError("GITHUB_ACCESS_DENIED", {
      message: "Your GitHub connection is missing or expired. Sign in with GitHub again.",
    });
  }
  return decrypt(toEnvelope(row), userId);
}
