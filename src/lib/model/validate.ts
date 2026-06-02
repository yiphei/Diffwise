/**
 * Structural / referential-integrity validation (§5.5, §6.6) — the enforcement of
 * the LOCKED "LLM-only with structural validation" decision. Every symbol / hunk
 * index / jump target / story target the model cited is verified against the
 * ParsedDiff / MODEL, and invented references are REPAIRED or DROPPED. Only the
 * FATAL class aborts generation. Deterministic, idempotent, no LLM call.
 *
 * The validator does NO sanitization — all prose is sanitized at render time
 * (DOMPurify; §10.2). It only enforces referential integrity.
 */
import {
  MODEL_VERSION,
  type Arch,
  type CorrectablePath,
  type Model,
  type Relation,
  type StoryBeat,
  type StoryTarget,
  type ValidationReport,
} from "./model";
import { computeStats, statusOf, type ParsedDiff } from "./parsed-diff";

/** Split a "file#sym" cross-link on the FIRST '#'. */
export function splitFileSym(ref: string): { file: string; sym: string | null } {
  const i = ref.indexOf("#");
  if (i < 0) return { file: ref, sym: null };
  return { file: ref.slice(0, i), sym: ref.slice(i + 1) };
}

export function validateModel(
  input: Model,
  parsed: ParsedDiff,
): { model: Model; report: ValidationReport } {
  const model: Model = structuredClone(input);
  const dropped: string[] = [];
  const fatal: string[] = [];
  const corrected = new Set<CorrectablePath>();

  // Rule 1: version must match.
  if (model.modelVersion !== MODEL_VERSION) {
    fatal.push(`modelVersion ${model.modelVersion} !== ${MODEL_VERSION}`);
    return { model, report: { dropped, fatal, correctedPaths: [...corrected] } };
  }

  // Rule 2: stats is computed-only (delivered via the `parsed` event, not a patch).
  model.stats = computeStats(parsed);

  // Rule 3/4/5: files — drop unknown paths, reconcile status, filter hunk indices.
  const keptFiles = [];
  let filesMutated = false;
  for (const f of model.files) {
    const pf = parsed.byPath[f.path];
    if (!pf) {
      dropped.push(`file ${f.path} not in diff — dropped`);
      filesMutated = true;
      continue;
    }
    const det = statusOf(pf);
    if (f.status !== det) {
      f.status = det;
      filesMutated = true;
    }
    const hunkCount = pf.hunks.length;
    for (const sym of f.symbols) {
      const valid = sym.hunks.filter((h) => Number.isInteger(h) && h >= 0 && h < hunkCount);
      if (valid.length !== sym.hunks.length) {
        dropped.push(`symbol ${f.path}#${sym.name}: out-of-range hunk indices removed`);
        sym.hunks = valid;
        filesMutated = true;
      }
    }
    keptFiles.push(f);
  }
  model.files = keptFiles;
  if (filesMutated) corrected.add("files");

  // Build the resolution indexes from the surviving files.
  const validFiles = new Set(model.files.map((f) => f.path));
  const symbolsByFile = new Map<string, Set<string>>();
  for (const f of model.files) {
    symbolsByFile.set(f.path, new Set(f.symbols.map((s) => s.name)));
  }
  const fileResolves = (file: string): boolean =>
    validFiles.has(file) && parsed.byPath[file] !== undefined;
  const symResolves = (file: string, sym: string): boolean =>
    fileResolves(file) && (symbolsByFile.get(file)?.has(sym) ?? false);
  /** A "file#sym" or "file" jump resolves fully (file + optional symbol). */
  const jumpResolves = (ref: string): boolean => {
    const { file, sym } = splitFileSym(ref);
    return sym === null ? fileResolves(file) : symResolves(file, sym);
  };

  // Rule 6: relations — drop dangling JumpRefs (keep the surrounding card/edge).
  let relationsMutated = false;
  for (const rel of model.relations) {
    if (rel.sourceTarget && !symResolves(rel.sourceTarget.file, rel.sourceTarget.sym)) {
      dropped.push(`relation "${rel.title}": sourceTarget dropped`);
      delete (rel as Relation).sourceTarget;
      relationsMutated = true;
    }
    for (const e of rel.edges) {
      if (e.target && !symResolves(e.target.file, e.target.sym)) {
        dropped.push(`relation "${rel.title}" edge "${e.what}": target dropped`);
        delete e.target;
        relationsMutated = true;
      }
    }
  }
  if (relationsMutated) corrected.add("relations");

  // Rule 6/7: arch — drop dangling node jumps, edges with dangling endpoints,
  // invalid edge-state overrides, and dangling net-effect jumps.
  const arch: Arch = model.arch;
  let archMutated = false;
  const nodeIds = new Set(arch.nodes.map((n) => n.id));
  for (const n of arch.nodes) {
    if (n.jump && !jumpResolves(n.jump)) {
      dropped.push(`arch node ${n.id}: jump "${n.jump}" dropped`);
      delete n.jump;
      archMutated = true;
    }
  }
  const keptEdges = [];
  for (const e of arch.edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) {
      dropped.push(`arch edge ${e.id}: dangling endpoint — dropped`);
      archMutated = true;
      continue;
    }
    for (const st of [e.states.before, e.states.after]) {
      if (st.from && !nodeIds.has(st.from)) {
        delete st.from;
        archMutated = true;
      }
      if (st.to && !nodeIds.has(st.to)) {
        delete st.to;
        archMutated = true;
      }
    }
    keptEdges.push(e);
  }
  arch.edges = keptEdges;
  for (const ne of arch.netEffect) {
    if (ne.jump && !jumpResolves(ne.jump)) {
      dropped.push(`arch netEffect "${ne.label}": jump dropped`);
      delete ne.jump;
      archMutated = true;
    }
  }
  if (archMutated) corrected.add("arch");

  // Rule 6/8: story — normalize legacy target.path, drop non-v1 / dangling beats,
  // dedupe ids.
  let storyMutated = false;
  const seenIds = new Set<string>();
  const keptBeats: StoryBeat[] = [];
  for (const beat of model.story) {
    const t = normalizeTarget(beat.target);
    if (t !== beat.target) {
      beat.target = t;
      storyMutated = true;
    }
    if (!targetResolves(t, fileResolves, symResolves)) {
      dropped.push(`story beat "${beat.id}": target unresolved/non-v1 — dropped`);
      storyMutated = true;
      continue;
    }
    let id = beat.id || "beat";
    if (seenIds.has(id)) {
      let n = 2;
      while (seenIds.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
      beat.id = id;
      storyMutated = true;
    }
    seenIds.add(id);
    keptBeats.push(beat);
  }
  model.story = keptBeats;
  if (storyMutated) corrected.add("story");

  // Rule 9: at least one file must survive.
  if (model.files.length === 0) {
    fatal.push("no files left after validation (empty review)");
  }

  return { model, report: { dropped, fatal, correctedPaths: [...corrected] } };
}

/** Normalize a model that imitated the prototype's `target.path` to `target.file`. */
function normalizeTarget(target: StoryTarget): StoryTarget {
  const anyT = target as unknown as { type?: string; path?: string; file?: string; name?: string };
  if ((anyT.type === "symbol" || anyT.type === "file") && anyT.path && !anyT.file) {
    return { ...(target as object), file: anyT.path } as StoryTarget;
  }
  return target;
}

function targetResolves(
  t: StoryTarget,
  fileResolves: (f: string) => boolean,
  symResolves: (f: string, s: string) => boolean,
): boolean {
  switch (t.type) {
    case "relations":
    case "arch":
      return true; // panel targets; arch degrades to relations+prose if empty
    case "file":
      return fileResolves(t.file);
    case "symbol":
      return symResolves(t.file, t.name);
    default:
      return false; // 'demo' or any non-v1 type
  }
}
