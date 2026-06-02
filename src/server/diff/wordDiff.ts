/**
 * LCS intra-line word diff (§4.5). The implementation lives in the shared module
 * `@/lib/model/word-diff` (so the level-3 client renderer and the server share one
 * deterministic source). This server-side module re-exports it for any prose the
 * pipeline needs to word-diff.
 */
export { tokenize, lcsMark, groupSpans, wordDiff } from "@/lib/model/word-diff";
export type { WordSpan, WordDiff } from "@/lib/model/word-diff";
