/**
 * The single in-memory review store (§7.3). Holds the MODEL + ParsedDiff for the
 * session only (nothing is persisted, § Persistence). Switching levels, opening
 * story mode, following cross-/deep-links, and toggling theme are ALL pure client
 * state changes — none re-call the server.
 *
 * The partial MODEL is built incrementally from §2.6 `model-patch` events:
 *   - path 'files'  → append-by-`path`, later-wins (merge per file object)
 *   - all others    → last-write-replace
 * On `done` we assert `modelVersion === MODEL_VERSION` (modelVersionOk).
 */
import { create } from "zustand";
import {
  MODEL_VERSION,
  type Model,
  type ModelFile,
  type ModelPatch,
  type StageName,
  type CostEstimate,
  type ValidationReport,
  STAGE_NAMES,
} from "@/lib/model/model";
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import type { ErrorCode } from "@/lib/model/errors";
import { fileDomId, symbolDomId, beatHash } from "@/lib/review/ids";
import { flash, scrollToCenter, afterLayout } from "@/lib/review/scroll";
import { runGeneration } from "./useGenerationStream";

export type Level = 0 | 1 | 2 | 3 | 4;

/** A deep-partial of Model assembled while streaming. */
export type PartialModel = {
  modelVersion?: number;
  meta?: Model["meta"];
  stats?: Model["stats"];
  themes?: Model["themes"];
  relations?: Model["relations"];
  files?: ModelFile[];
  arch?: Model["arch"];
  story?: Model["story"];
};

export type GenStatus =
  | { phase: "idle" }
  | { phase: "estimating"; estimate?: CostEstimate }
  | { phase: "streaming"; stage: StageName; pct: number }
  | { phase: "validating" }
  | { phase: "ready" }
  | { phase: "error"; code: ErrorCode; message: string };

export interface DeepLink {
  level: Level;
  /** A DOM id to flash + scroll to once the level has laid out, or null. */
  elementId: string | null;
}

export interface ReviewState {
  /** Generation request inputs (client memory only; sent in POST /api/generate). */
  request: { repo: string; prNumber: number } | null;
  status: GenStatus;

  /** ParsedDiff arrives first (deterministic); MODEL fills in incrementally. */
  parsed: ParsedDiff | null;
  /** Partial during streaming; complete + validated at phase 'ready'. */
  model: PartialModel | null;
  modelVersionOk: boolean;
  report: ValidationReport | null;

  level: Level;
  deepLink: DeepLink | null;
  story: { active: boolean; beat: number };
  theme: "light" | "dark";
  reducedMotion: boolean;

  // ---- actions ----
  startGeneration(req: { repo: string; prNumber: number }): void;
  setLevel(l: Level): void;
  jumpTo(jump: string): void;
  applyHash(hash: string): void;
  setTheme(t: "light" | "dark"): void;
  enterStory(): void;
  exitStory(): void;
  gotoBeat(i: number): void;

  // ---- low-level setters used by the generation stream ----
  setStatus(status: GenStatus): void;
  setParsed(parsed: ParsedDiff): void;
  applyPatch(patch: ModelPatch): void;
  finishGeneration(modelVersionOk: boolean, report: ValidationReport | null): void;
  setReducedMotion(v: boolean): void;
}

/** Merge a `files` patch: append-by-path, later-wins (replace the file object). */
function mergeFiles(existing: ModelFile[] | undefined, incoming: ModelFile[]): ModelFile[] {
  const byPath = new Map<string, ModelFile>();
  for (const f of existing ?? []) byPath.set(f.path, f);
  for (const f of incoming) byPath.set(f.path, f); // later wins
  return Array.from(byPath.values());
}

/** Reflect the current level + element into the URL hash (replaceState, §7.6). */
function updateHash(level: Level, elementId?: string): void {
  if (typeof window === "undefined") return;
  history.replaceState(null, "", beatHash(level, elementId));
}

/** Locate a symbol row by its data attributes (mirrors prototype `qSym`). */
function qSym(file: string, name: string): HTMLElement | null {
  return document.getElementById(symbolDomId(file, name));
}

/** Map a streaming stage to a coarse progress percent (§7.4 ordering). */
function pctForStage(stage: StageName): number {
  const idx = STAGE_NAMES.indexOf(stage);
  if (idx < 0) return 5;
  // Spread 10..95 across the six stages.
  return Math.round(10 + (idx / Math.max(1, STAGE_NAMES.length - 1)) * 85);
}

function initialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem("dw_theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* localStorage may be unavailable */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  request: null,
  status: { phase: "idle" },
  parsed: null,
  model: null,
  modelVersionOk: true,
  report: null,
  level: 0,
  deepLink: null,
  story: { active: false, beat: 0 },
  theme: initialTheme(),
  reducedMotion: initialReducedMotion(),

  startGeneration(req) {
    set({
      request: req,
      status: { phase: "estimating" },
      parsed: null,
      model: null,
      modelVersionOk: true,
      report: null,
      level: 0,
      deepLink: null,
      story: { active: false, beat: 0 },
    });
    // runGeneration mutates the store via the low-level setters above.
    void runGeneration(get(), req);
  },

  setLevel(l) {
    set({ level: l });
    updateHash(l);
  },

  jumpTo(jump) {
    const hashIdx = jump.indexOf("#");
    const reduced = get().reducedMotion;
    if (hashIdx >= 0) {
      const file = jump.slice(0, hashIdx);
      const name = jump.slice(hashIdx + 1); // split on FIRST '#'
      get().setLevel(3);
      afterLayout(() => {
        const el = qSym(file, name);
        if (el) {
          flash(el);
          const head = el.querySelector(".sym-head") ?? el;
          scrollToCenter(head, reduced);
          updateHash(3, el.id);
          set({ deepLink: { level: 3, elementId: el.id } });
        }
      });
    } else {
      get().setLevel(1);
      afterLayout(() => {
        const el = document.getElementById(fileDomId(jump));
        if (el) {
          flash(el);
          scrollToCenter(el, reduced);
          updateHash(1, el.id);
          set({ deepLink: { level: 1, elementId: el.id } });
        }
      });
    }
  },

  applyHash(hash) {
    const m = /^#L([0-4])(?:\/(.+))?$/.exec(hash);
    if (!m) {
      get().setLevel(0);
      return;
    }
    const level = Number(m[1]) as Level;
    const elementId = m[2] ?? null;
    set({ level, deepLink: { level, elementId } });
    if (!elementId) return;
    const reduced = get().reducedMotion;
    afterLayout(() => {
      const el = document.getElementById(elementId);
      if (el) {
        flash(el);
        const head = el.querySelector(".sym-head") ?? el;
        scrollToCenter(head, reduced);
      }
    });
  },

  setTheme(t) {
    set({ theme: t });
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", t);
    }
    try {
      window.localStorage.setItem("dw_theme", t);
    } catch {
      /* ignore */
    }
  },

  enterStory() {
    if (!(get().model?.story?.length ?? 0)) return;
    set({ story: { active: true, beat: 0 } });
  },

  exitStory() {
    set({ story: { active: false, beat: 0 } });
  },

  gotoBeat(i) {
    const beats = get().model?.story ?? [];
    if (beats.length === 0) return;
    const clamped = Math.max(0, Math.min(i, beats.length - 1));
    set({ story: { active: true, beat: clamped } });
  },

  // ---- stream setters ----
  setStatus(status) {
    set({ status });
  },

  setParsed(parsed) {
    set({ parsed });
  },

  applyPatch(patch) {
    set((s) => {
      const model: PartialModel = { ...(s.model ?? {}) };
      switch (patch.path) {
        case "meta":
          model.meta = patch.value;
          break;
        case "themes":
          model.themes = patch.value;
          break;
        case "files":
          model.files = mergeFiles(model.files, patch.value);
          break;
        case "relations":
          model.relations = patch.value;
          break;
        case "arch":
          model.arch = patch.value;
          break;
        case "story":
          model.story = patch.value;
          break;
      }
      return { model };
    });
  },

  finishGeneration(modelVersionOk, report) {
    set((s) => ({
      status: { phase: "ready" },
      modelVersionOk,
      report,
      model: s.model ? { ...s.model, modelVersion: MODEL_VERSION } : s.model,
    }));
  },

  setReducedMotion(v) {
    set({ reducedMotion: v });
  },
}));
