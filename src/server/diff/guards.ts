/**
 * Input guards (§4.6 size cap, §4.8 empty/binary). The 10,000-changed-lines hard
 * cap gates ALL LLM spend; it is checked twice (pre-flight on PR metadata and
 * post-parse on the recomputed ParsedDiff). Noise lines count toward the cap.
 *
 * Errors use the canonical §10.9 ErrorCode union: PR_OVER_LINE_CAP (422) and
 * EMPTY_OR_BINARY_DIFF (422).
 */
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import { DiffwiseError } from "@/lib/model/errors";
import { env } from "@/server/config/env";

/** The configured hard cap on changed lines (additions + deletions). */
export function MAX_CHANGED_LINES(): number {
  return env.MAX_CHANGED_LINES;
}

/**
 * Reject PRs whose total changed lines exceed the cap. No partial review, no
 * scoping — over-cap PRs are rejected outright (§4.6).
 */
export function enforceSizeCap(changedLines: number): void {
  const limit = MAX_CHANGED_LINES();
  if (changedLines > limit) {
    throw new DiffwiseError("PR_OVER_LINE_CAP", {
      changedLines,
      limit,
      message:
        `This PR changes ${changedLines.toLocaleString()} lines, over Diffwise's ` +
        `${limit.toLocaleString()}-line limit. Diffwise reviews the whole PR at once ` +
        `and can't review a PR this large in v1.`,
    });
  }
}

/**
 * Reject diffs with nothing reviewable: zero files, or every file is binary /
 * carries zero textual hunks (§4.8 EMPTY_OR_BINARY_DIFF).
 */
export function validateNonEmpty(parsed: ParsedDiff): void {
  if (parsed.files.length === 0) {
    throw new DiffwiseError("EMPTY_OR_BINARY_DIFF");
  }
  const hasTextualHunk = parsed.files.some(
    (f) => !f.isBinary && f.hunks.some((h) => h.lines.length > 0),
  );
  if (!hasTextualHunk) {
    throw new DiffwiseError("EMPTY_OR_BINARY_DIFF");
  }
}
