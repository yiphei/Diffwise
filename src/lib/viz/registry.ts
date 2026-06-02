/**
 * Visualization Component Registry (§9.2).
 *
 * The frontend deterministically maps a MODEL fragment -> the best typed
 * template for a slot. The pipeline imports NOTHING from here; the only
 * producer->consumer contract is MODEL (§6). Selection is pure, synchronous,
 * deterministic and consumer-side (§9.5).
 */
import type { ComponentType } from "react";
import type { Model } from "@/lib/model/model";
import type { ParsedDiff } from "@/lib/model/parsed-diff";

/** Coarse slot a template fills. The frontend asks the registry for the best
 *  template *within a slot*; slots never compete across categories. */
export type VizSlot =
  | "intent" // level 0 header (title/summary/stats/themes)
  | "relations" // refactor-trace panel (level 0 + arch)
  | "file" // level 1 file card
  | "symbol" // level 2 symbol entry
  | "code" // level 3 line/word diff for a symbol's hunks
  | "arch"; // level 4 architecture / wiring diagram

/** Everything a template renderer is allowed to read. Read-only. The renderer
 *  NEVER receives the raw API key or any server secret — only MODEL + ParsedDiff,
 *  both already in browser-tab memory (§ Persistence). */
export interface VizContext {
  model: Model;
  parsed: ParsedDiff;
  /** Imperative cross-link: jump to "file#sym" or "file". Implemented by the
   *  shell (§9.6); templates call it, they don't own navigation. */
  jump: (ref: string) => void;
  /** Current zoom level, for templates that adapt density. */
  level: 0 | 1 | 2 | 3 | 4;
  theme: "light" | "dark";
  reducedMotion: boolean;
}

/** Score in [0,1]; 0 means "does not apply", >0 ranks candidates within a slot.
 *  Pure, synchronous, deterministic. Given the SAME inputs it MUST return the
 *  same score (selection must be stable across re-render). */
export type AppliesFn<P> = (input: {
  slot: VizSlot;
  /** The MODEL fragment this template would render (typed per slot — see §9.5). */
  data: unknown;
  ctx: VizContext;
}) => { score: number; props: P } | { score: 0 };

export interface VizTemplate<P = unknown> {
  /** Stable unique id, e.g. "arch.static". Used in logs + deep-link hints. */
  id: string;
  /** Human label for the registry index / debug overlay. */
  title: string;
  /** Which slot this template can fill. */
  slot: VizSlot;
  /** Name of the props type (for the debug overlay + docs; not load-bearing). */
  propsName: string;
  /** Predicate + parameterizer. Returns the *validated, typed* props on a hit. */
  applies: AppliesFn<P>;
  /** The React component. Receives EXACTLY the props `applies` produced. */
  Renderer: ComponentType<P & { ctx: VizContext }>;
  /** If true, this template is the guaranteed last-resort for its slot
   *  (score floor); at most one fallback per slot. */
  isFallback?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY = new Map<VizSlot, VizTemplate<any>[]>();

/** Register a template for its slot. Throws if a second fallback is added to a
 *  slot (at most one isFallback per slot — §9.2). */
export function register<P>(t: VizTemplate<P>): void {
  const list = REGISTRY.get(t.slot) ?? [];
  if (t.isFallback && list.some((x) => x.isFallback)) {
    throw new Error(`Two fallbacks registered for slot ${t.slot}`);
  }
  list.push(t);
  REGISTRY.set(t.slot, list);
}

/** Pick the highest-scoring template for a slot+data. Falls back to the slot's
 *  isFallback template (score is ignored for it). NEVER returns null for a slot
 *  that has a fallback — guarantees "never a blank" (§9.6). */
export function selectTemplate<P = unknown>(
  slot: VizSlot,
  data: unknown,
  ctx: VizContext,
): { template: VizTemplate<P>; props: P } {
  const list = REGISTRY.get(slot) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let best: { template: VizTemplate<any>; props: any; score: number } | null = null;

  for (const t of list) {
    if (t.isFallback) continue; // fallback handled last
    const r = t.applies({ slot, data, ctx });
    if (r.score > 0 && (!best || r.score > best.score)) {
      best = { template: t, props: (r as { score: number; props: P }).props, score: r.score };
    }
  }
  if (best) {
    return { template: best.template as VizTemplate<P>, props: best.props as P };
  }

  const fb = list.find((t) => t.isFallback);
  if (!fb) throw new Error(`No template (and no fallback) for slot ${slot}`);
  const r = fb.applies({ slot, data, ctx }); // fallback always returns props
  return {
    template: fb as VizTemplate<P>,
    props: (r as { score: number; props: P }).props,
  };
}

/** Test/debug helper: list registered template ids for a slot. */
export function templatesForSlot(slot: VizSlot): ReadonlyArray<VizTemplate> {
  return REGISTRY.get(slot) ?? [];
}
