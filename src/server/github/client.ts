/**
 * Authenticated, per-request Octokit factory (§4.2 / §4.9). The OAuth token is
 * JIT-decrypted upstream and passed in here; it is NEVER logged. We enable the
 * retry and throttling plugins:
 *  - onRateLimit (primary limit): retry up to twice with Octokit's backoff.
 *  - onSecondaryRateLimit (abuse limit): never retry — throw the canonical
 *    DiffwiseError('GITHUB_RATE_LIMITED', { retryAfterSec }).
 */
import { Octokit } from "@octokit/rest";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { DiffwiseError } from "@/lib/model/errors";

const DiffwiseOctokit = Octokit.plugin(retry, throttling);

const USER_AGENT = "diffwise/1.0";
const MAX_PRIMARY_RETRIES = 2;

/** Build an Octokit authenticated with the caller's decrypted OAuth token. */
export function githubClientForUser(decryptedToken: string): Octokit {
  return new DiffwiseOctokit({
    auth: decryptedToken,
    userAgent: USER_AGENT,
    request: { timeout: 30_000 },
    throttle: {
      onRateLimit: (_retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) => {
        // Retry primary-limit hits up to twice with the plugin's backoff.
        return retryCount < MAX_PRIMARY_RETRIES;
      },
      onSecondaryRateLimit: (retryAfter: number) => {
        // Secondary (abuse) limits are not safe to retry — surface immediately.
        throw new DiffwiseError("GITHUB_RATE_LIMITED", { retryAfterSec: retryAfter });
      },
    },
  }) as unknown as Octokit;
}
