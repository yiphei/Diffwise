/**
 * Entry point for the GitHub fetch phase (§4.3). Builds a SourceProvider bound to
 * the caller's decrypted OAuth token, plus a thin convenience wrapper that runs
 * the whole fetch phase in one call.
 */
import type { FetchPhaseResult, SourceProvider } from "@/server/github/provider";
import { GitHubProvider } from "@/server/github/provider";

/** A SourceProvider authenticated with the user's decrypted OAuth token. */
export function githubProviderForUser(token: string): SourceProvider {
  return new GitHubProvider(token);
}

/**
 * Convenience: run the full fetch phase (metadata + diff + files list -> parsed
 * + stats) for one PR using the given token. Errors surface as DiffwiseError.
 */
export function fetchPullRequest(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<FetchPhaseResult> {
  return githubProviderForUser(token).fetchPullRequest(owner, repo, prNumber);
}
