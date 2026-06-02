/**
 * GitHub fetch phase (§4.3 / §4.10). Turns (owner, repo, prNumber) into validated
 * PR metadata + a canonical ParsedDiff + computed stats. Deterministic, no LLM.
 *
 * Error mapping to the canonical §10.9 ErrorCode union:
 *   404               -> PR_NOT_FOUND
 *   403 (rate headers) -> GITHUB_RATE_LIMITED, else GITHUB_ACCESS_DENIED
 *   406 (on .diff)    -> PR_OVER_LINE_CAP (diff exceeds GitHub's own ceiling)
 *   429               -> GITHUB_RATE_LIMITED
 *   5xx / network     -> GITHUB_UNAVAILABLE
 */
import type { Octokit } from "@octokit/rest";
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import type { ModelStats } from "@/lib/model/model";
import { DiffwiseError, isDiffwiseError } from "@/lib/model/errors";
import { githubClientForUser } from "@/server/github/client";
import {
  buildParsedDiff,
  parseUnifiedDiff,
  reconcileWithFilesList,
  type GithubFileEntry,
} from "@/server/diff/parse";
import { computeStats } from "@/server/diff/stats";
import {
  isPrimaryRateLimited,
  rateLimitError,
} from "@/server/github/rateLimit";

/** PR provenance + aggregate counts (§4.3a / §4.10). */
export interface PrMeta {
  title: string;
  body: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  isFork: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
}

/** Output of the fetch phase, handed to the pipeline (§4.10). */
export interface FetchPhaseResult {
  parsed: ParsedDiff;
  stats: ModelStats;
  prMeta: PrMeta;
}

/** Source abstraction so the pipeline can be wired to other providers later. */
export interface SourceProvider {
  fetchPrMeta(owner: string, repo: string, prNumber: number): Promise<PrMeta>;
  fetchPullRequest(owner: string, repo: string, prNumber: number): Promise<FetchPhaseResult>;
}

/** Loosely-typed view of an Octokit error (RequestError) for mapping. */
interface OctokitLikeError {
  status?: number;
  response?: { headers?: Record<string, string | number | undefined> } | undefined;
  message?: string;
  code?: string;
}

function asOctokitError(e: unknown): OctokitLikeError {
  if (typeof e === "object" && e !== null) return e as OctokitLikeError;
  return {};
}

/**
 * Map a thrown Octokit/network error to a canonical DiffwiseError.
 * `onDiff` distinguishes the diff-media-type call (where 406 means over-cap).
 */
function mapGithubError(e: unknown, onDiff: boolean): DiffwiseError {
  if (isDiffwiseError(e)) return e;
  const err = asOctokitError(e);
  const status = err.status;
  const headers = err.response?.headers;

  if (status === 404) {
    return new DiffwiseError("PR_NOT_FOUND", { cause: e });
  }
  if (status === 406 && onDiff) {
    // GitHub refuses to render a diff larger than its own ceiling — necessarily
    // larger than our cap.
    return new DiffwiseError("PR_OVER_LINE_CAP", { cause: e });
  }
  if (status === 429) {
    return rateLimitError(headers, e);
  }
  if (status === 403) {
    if (isPrimaryRateLimited(headers)) {
      return rateLimitError(headers, e);
    }
    return new DiffwiseError("GITHUB_ACCESS_DENIED", { cause: e });
  }
  if (status !== undefined && status >= 500) {
    return new DiffwiseError("GITHUB_UNAVAILABLE", { cause: e });
  }
  // Network / timeout / unknown -> treat as transient GitHub unavailability.
  return new DiffwiseError("GITHUB_UNAVAILABLE", { cause: e });
}

export class GitHubProvider implements SourceProvider {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = githubClientForUser(token);
  }

  /** GET the PR (existence/access + provenance + aggregate counts) — §4.3a. */
  async fetchPrMeta(owner: string, repo: string, prNumber: number): Promise<PrMeta> {
    try {
      const res = await this.octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}",
        { owner, repo, pull_number: prNumber },
      );
      const pr = res.data;
      const baseRepoFullName = `${owner}/${repo}`;
      const headRepoFullName = pr.head?.repo?.full_name ?? null;
      return {
        title: pr.title ?? "",
        body: pr.body ?? "",
        baseRef: pr.base?.ref ?? "",
        headRef: pr.head?.ref ?? "",
        baseSha: pr.base?.sha ?? "",
        headSha: pr.head?.sha ?? "",
        isFork: headRepoFullName !== null && headRepoFullName !== baseRepoFullName,
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        changedFiles: pr.changed_files ?? 0,
      };
    } catch (e) {
      throw mapGithubError(e, false);
    }
  }

  /**
   * Fetch the raw unified diff + paginated files list and produce the canonical
   * ParsedDiff + stats. Caller is responsible for the cap/empty guards (§4.6/§4.8)
   * on the returned stats. — §4.3b/c, §4.4, §4.10.
   */
  async fetchPullRequest(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<FetchPhaseResult> {
    const prMeta = await this.fetchPrMeta(owner, repo, prNumber);

    // (b) Raw unified diff via the .diff media type (single, un-paginated body).
    let rawDiff: string;
    try {
      const diffRes = await this.octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}",
        { owner, repo, pull_number: prNumber, mediaType: { format: "diff" } },
      );
      rawDiff = diffRes.data as unknown as string;
    } catch (e) {
      throw mapGithubError(e, true);
    }

    const parsedFiles = parseUnifiedDiff(rawDiff);

    // (c) Files list — paginated; enriches binary flags / counts and noise.
    let ghFiles: GithubFileEntry[];
    try {
      ghFiles = (await this.octokit.paginate(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
        { owner, repo, pull_number: prNumber, per_page: 100 },
      )) as unknown as GithubFileEntry[];
    } catch (e) {
      throw mapGithubError(e, false);
    }

    const reconciled = reconcileWithFilesList(parsedFiles, ghFiles);
    const parsed = buildParsedDiff(reconciled);
    const stats = computeStats(parsed);

    return { parsed, stats, prMeta };
  }
}
