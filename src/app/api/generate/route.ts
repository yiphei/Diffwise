import { DiffwiseError, toDiffwiseError } from "@/lib/model/errors";
import { changedLines } from "@/lib/model/parsed-diff";
import { enforceSizeCap, validateNonEmpty } from "@/server/diff/guards";
import { getGithubToken } from "@/server/credentials/github-token";
import { NeedsAnthropicKeyError, UserProvidedKeySource } from "@/server/credentials/source";
import { credentialStore } from "@/server/credentials/store";
import { githubProviderForUser } from "@/server/github/fetchPr";
import { jsonError, parseRepoAndPr, requireUserOrThrow } from "@/server/http";
import { estimateCost } from "@/server/pipeline/estimate";
import { runPipeline } from "@/server/pipeline/run";
import { acquireGenerationSlot } from "@/server/ratelimit";
import { createSseResponse } from "@/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // long-lived SSE (Railway container has no cap)

/** POST → SSE generation stream (§2.5/§2.6). The whole review in one shot. */
export async function POST(req: Request): Promise<Response> {
  let userId: string;
  let owner: string;
  let name: string;
  let repo: string;
  let prNumber: number;
  let token: string;

  // Pre-stream checks return non-200 JSON; in-stream failures are SSE `error` events.
  try {
    const user = await requireUserOrThrow(req);
    userId = user.id;
    const body = (await req.json().catch(() => ({}))) as { repo?: unknown; prNumber?: unknown };
    ({ owner, name, repo, prNumber } = parseRepoAndPr(body.repo, body.prNumber));
    token = await getGithubToken(userId);
    const aRow = await credentialStore.get(userId, "anthropic_byok");
    if (!aRow || aRow.status !== "active") throw new DiffwiseError("NO_BYOK_KEY");
  } catch (e) {
    return jsonError(e);
  }

  const slot = await acquireGenerationSlot(userId);
  if (!slot.ok) {
    return jsonError(new DiffwiseError(slot.code, { retryAfterSec: slot.retryAfter }));
  }

  const creds = new UserProvidedKeySource();

  return createSseResponse(async (emit, signal) => {
    try {
      const provider = githubProviderForUser(token);
      const { parsed, prMeta } = await provider.fetchPullRequest(owner, name, prNumber);
      enforceSizeCap(changedLines(parsed));
      validateNonEmpty(parsed);
      const estimate = estimateCost(parsed, { repo, prNumber, title: prMeta.title });
      await runPipeline({ parsed, prMeta, repo, prNumber, estimate, creds, userId, emit, signal });
    } catch (e) {
      const err =
        e instanceof NeedsAnthropicKeyError ? new DiffwiseError("NO_BYOK_KEY") : toDiffwiseError(e);
      emit({
        event: "error",
        data: {
          code: err.code,
          message: err.userMessage,
          ...(err.retryAfterSec != null ? { retryAfter: err.retryAfterSec } : {}),
        },
      });
    } finally {
      slot.release();
    }
  }, req.signal);
}
