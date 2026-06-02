import { changedLines } from "@/lib/model/parsed-diff";
import { enforceSizeCap, validateNonEmpty } from "@/server/diff/guards";
import { getGithubToken } from "@/server/credentials/github-token";
import { githubProviderForUser } from "@/server/github/fetchPr";
import { json, jsonError, parseRepoAndPr, requireUserOrThrow } from "@/server/http";
import { estimateCost } from "@/server/pipeline/estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pre-flight size check + cost/time estimate (§2.5). No LLM call. */
export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUserOrThrow(req);
    const body = (await req.json().catch(() => ({}))) as { repo?: unknown; prNumber?: unknown };
    const { owner, name, repo, prNumber } = parseRepoAndPr(body.repo, body.prNumber);

    const token = await getGithubToken(user.id);
    const provider = githubProviderForUser(token);

    // Cheap metadata pre-flight: reject huge PRs before downloading the full diff.
    const meta = await provider.fetchPrMeta(owner, name, prNumber);
    enforceSizeCap(meta.additions + meta.deletions);

    // Authoritative recompute from the parsed diff.
    const { parsed } = await provider.fetchPullRequest(owner, name, prNumber);
    enforceSizeCap(changedLines(parsed));
    validateNonEmpty(parsed);

    const estimate = estimateCost(parsed, { repo, prNumber, title: meta.title });
    return json(estimate);
  } catch (e) {
    return jsonError(e);
  }
}
