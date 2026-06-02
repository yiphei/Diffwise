/**
 * Deterministic LCS intra-line word diff (§4.5 / §6.4). Pure, shared client+server.
 * NOT part of the MODEL and never produced by the LLM — it is frontend rendering
 * logic applied to a single (del, add) line pair. The level-3 renderer pairs an
 * equal-length run of consecutive `del` lines with the following `add` lines.
 *
 * Output is structured spans (token + changed flag), never an HTML string, so the
 * renderer builds <span> elements with text children — no raw-HTML path exists
 * for diff content (§7.5.3 / §10.2).
 */

const TOKEN_RE = /[A-Za-z0-9_$]+|\s+|[^A-Za-z0-9_$\s]/g;

/** Cap to bound the O(n*m) DP on pathological lines (e.g. minified). */
const MAX_TOKENS = 400;

export function tokenize(s: string): string[] {
  return s.match(TOKEN_RE) ?? [];
}

/** LCS over token arrays; returns which tokens are UNCHANGED (true) on each side. */
export function lcsMark(a: string[], b: string[]): { ma: boolean[]; mb: boolean[] } {
  const n = a.length;
  const m = b.length;
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const ma = new Array<boolean>(n).fill(false);
  const mb = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ma[i] = true;
      mb[j] = true;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return { ma, mb };
}

export interface WordSpan {
  text: string;
  changed: boolean; // false => unchanged token (wd-eq)
}

export interface WordDiff {
  del: WordSpan[];
  add: WordSpan[];
}

/** Coalesce consecutive same-class tokens into spans. */
export function groupSpans(tokens: string[], unchanged: boolean[]): WordSpan[] {
  const spans: WordSpan[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const changed = !unchanged[i];
    const last = spans[spans.length - 1];
    if (last && last.changed === changed) {
      last.text += tokens[i]!;
    } else {
      spans.push({ text: tokens[i]!, changed });
    }
  }
  return spans;
}

/** Intra-line word diff for one (del, add) line pair. */
export function wordDiff(delStr: string, addStr: string): WordDiff {
  const a = tokenize(delStr);
  const b = tokenize(addStr);
  // Pathological long-line fallback: mark the whole line changed (no DP).
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return {
      del: delStr ? [{ text: delStr, changed: true }] : [],
      add: addStr ? [{ text: addStr, changed: true }] : [],
    };
  }
  const { ma, mb } = lcsMark(a, b);
  return { del: groupSpans(a, ma), add: groupSpans(b, mb) };
}
