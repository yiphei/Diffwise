/**
 * Noise classification (§4.7). Flags real-but-uninteresting files so the frontend
 * can de-emphasize/collapse them and the pipeline can down-rank them. Noise files
 * are NEVER dropped from ParsedDiff — they still count toward the cap and remain
 * available at level 3. `classifyNoise` only stamps `ParsedFile.noise`.
 *
 * Ordered checks, FIRST MATCH WINS: binary → lockfile → generated → vendored →
 * minified (§4.7 table).
 */
import type { NoiseClass } from "@/lib/model/parsed-diff";
import type { ParsedFile } from "@/lib/model/parsed-diff";

/** Lockfile basenames (§4.7). */
const LOCKFILES = new Set<string>([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
  "Pipfile.lock",
]);

/** Threshold above which a non-binary file is considered minified (§4.7). */
const MINIFIED_MEDIAN = 500;

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/** Path/name markers for machine-generated files (§4.7). */
function isGenerated(path: string): boolean {
  if (/\.pb\.go$/.test(path)) return true;
  if (/\.generated\./.test(path)) return true;
  if (/_pb2\.py$/.test(path)) return true;
  if (/\.min\.(js|css)$/.test(path)) return true;
  if (/(^|\/)(dist|build|__generated__)\//.test(path)) return true;
  return false;
}

/** Path prefixes for vendored / third-party code (§4.7). */
function isVendored(path: string): boolean {
  return /(^|\/)(vendor|node_modules|third_party|Pods|\.yarn)\//.test(path);
}

/** Median content length across all hunk body lines. */
function medianHunkLineLength(f: ParsedFile): number {
  const lengths: number[] = [];
  for (const h of f.hunks) {
    for (const ln of h.lines) {
      lengths.push(ln.c.length);
    }
  }
  if (lengths.length === 0) return 0;
  lengths.sort((a, b) => a - b);
  const mid = Math.floor(lengths.length / 2);
  if (lengths.length % 2 === 1) return lengths[mid] as number;
  return ((lengths[mid - 1] as number) + (lengths[mid] as number)) / 2;
}

/**
 * Classify a parsed file's noise level. Returns null for an ordinary,
 * interesting file. First match wins per the §4.7 ordering.
 */
export function classifyNoise(f: ParsedFile): NoiseClass | null {
  if (f.isBinary) return "binary";

  const path = f.newPath ?? f.oldPath ?? "";

  if (LOCKFILES.has(basename(path))) return "lockfile";
  if (isGenerated(path)) return "generated";
  if (isVendored(path)) return "vendored";
  if (medianHunkLineLength(f) > MINIFIED_MEDIAN) return "minified";

  return null;
}
