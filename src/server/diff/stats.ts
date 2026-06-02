/**
 * Diff statistics (§4.6 / §6.7). `computeStats` is the single source of truth for
 * MODEL.stats — re-exported from the shared module so server callers import it
 * from one place. `changedLinesOf` is the cap metric (additions + deletions).
 */
import type { ModelStats } from "@/lib/model/model";
import { computeStats } from "@/lib/model/parsed-diff";

export { computeStats };

/** Total changed lines = additions + deletions (the §4.6 cap metric). */
export function changedLinesOf(stats: ModelStats): number {
  return stats.additions + stats.deletions;
}
