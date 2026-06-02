"use client";

/**
 * StoryProvider — the story state machine (§8.2). Mounted once inside the review
 * shell. It owns NO copy of the MODEL; it reads model.story + the shell's
 * setLevel/spotlight via the store. The active/curBeat truth lives in the
 * review store (story.active / story.beat); this provider mirrors it into a
 * StoryState + exposes a StoryApi (enter/exit/goto/next/prev) and drives each
 * beat's target via driveBeat (§8.4).
 *
 * Behavioral rules (§8.2): enter sets body[data-story] + goto(curBeat);
 * exit clears the ring but LEAVES level/state as-is; goto clamps to
 * [0, story.length-1]; next/prev are clamped no-ops at the ends.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { StoryBeat } from "@/lib/model/model";
import { useReviewStore } from "@/components/review/state/useReviewStore";
import { spotlight as spotlightFn, clearSpotlight, afterLayout } from "@/lib/review/scroll";
import { driveBeat, type ShellCtl } from "./resolveBeatTarget";

export interface StoryState {
  isActive: boolean; // body[data-story] mirror; true => card visible, kbd bound
  curBeat: number; // index into model.story; clamped 0..story.length-1
  spotlightId: string | null; // DOM id currently ringed (the .spotlight element)
}

export interface StoryApi {
  enter(): void; // setActive(true); goto(curBeat ?? 0)
  exit(): void; // setActive(false); clearSpotlight(); leave level/state as-is
  goto(i: number): void; // clamp; setState; renderCard; driveTarget(beat)
  next(): void; // goto(curBeat + 1)  (no wrap; clamped at last)
  prev(): void; // goto(curBeat - 1)  (no wrap; clamped at first)
  state: StoryState;
  beats: StoryBeat[];
}

const StoryContext = createContext<StoryApi | null>(null);

/** Access the story API. Returns null when no provider is mounted. */
export function useStory(): StoryApi | null {
  return useContext(StoryContext);
}

export function StoryProvider({ children }: { children: ReactNode }) {
  const beats = useReviewStore((s) => s.model?.story ?? []);
  const active = useReviewStore((s) => s.story.active);
  const curBeat = useReviewStore((s) => s.story.beat);
  const reducedMotion = useReviewStore((s) => s.reducedMotion);

  const setLevel = useReviewStore((s) => s.setLevel);
  const enterStory = useReviewStore((s) => s.enterStory);
  const exitStory = useReviewStore((s) => s.exitStory);
  const gotoBeat = useReviewStore((s) => s.gotoBeat);

  // The id currently ringed; mirrors what driveBeat last spotlighted.
  const spotlightIdRef = useRef<string | null>(null);

  // A spotlight wrapper that records which id is ringed (for StoryState +
  // aria-current management) and delegates to the shared scroll helper.
  const spotlight = useCallback((id: string | null) => {
    // Clear aria-current from any previously ringed element.
    if (typeof document !== "undefined") {
      for (const el of Array.from(document.querySelectorAll('[aria-current="true"]'))) {
        el.removeAttribute("aria-current");
      }
    }
    spotlightFn(id);
    spotlightIdRef.current = id;
    if (id && typeof document !== "undefined") {
      const el = document.getElementById(id);
      if (el) el.setAttribute("aria-current", "true");
    }
  }, []);

  // The shell control surface handed to driveBeat. Arch is STATIC in v1, so
  // selectArchNode is a no-op here (the diagram owns its own selection state).
  const shell: ShellCtl = useMemo(
    () => ({
      setLevel,
      selectArchNode: () => {
        /* static arch: no shell-driven node selection in v1 */
      },
      afterLayout,
      reduceMotion: reducedMotion,
    }),
    [setLevel, reducedMotion],
  );

  const goto = useCallback(
    (i: number) => {
      if (beats.length === 0) return;
      const clamped = Math.max(0, Math.min(i, beats.length - 1));
      gotoBeat(clamped); // store clamps + sets active; keeps single source of truth
      const beat = beats[clamped];
      if (beat) driveBeat(beat, shell, spotlight);
    },
    [beats, gotoBeat, shell, spotlight],
  );

  const enter = useCallback(() => {
    if (beats.length === 0) return;
    enterStory(); // store: active=true, beat resets per store rule
    // Drive whatever beat the store now points at (re-entry resumes if the
    // store retained it; this store resets to 0 on enter).
    const target = useReviewStore.getState().story.beat;
    const beat = beats[Math.max(0, Math.min(target, beats.length - 1))];
    if (beat) driveBeat(beat, shell, spotlight);
  }, [beats, enterStory, shell, spotlight]);

  const exit = useCallback(() => {
    clearSpotlight();
    spotlightIdRef.current = null;
    if (typeof document !== "undefined") {
      for (const el of Array.from(document.querySelectorAll('[aria-current="true"]'))) {
        el.removeAttribute("aria-current");
      }
    }
    exitStory(); // does NOT reset level / arch state (§8.2)
  }, [exitStory]);

  const next = useCallback(() => goto(curBeat + 1), [goto, curBeat]);
  const prev = useCallback(() => goto(curBeat - 1), [goto, curBeat]);

  // Mirror isActive into body[data-story] (§8.2 — slides the card up via CSS).
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (active) document.body.setAttribute("data-story", "");
    else document.body.removeAttribute("data-story");
    return () => {
      document.body.removeAttribute("data-story");
    };
  }, [active]);

  // When the story deactivates (e.g. via the store directly), clear the ring.
  useEffect(() => {
    if (!active) {
      clearSpotlight();
      spotlightIdRef.current = null;
    }
  }, [active]);

  const state: StoryState = {
    isActive: active,
    curBeat,
    spotlightId: spotlightIdRef.current,
  };

  const api: StoryApi = useMemo(
    () => ({ enter, exit, goto, next, prev, state, beats }),
    [enter, exit, goto, next, prev, state, beats],
  );

  return <StoryContext.Provider value={api}>{children}</StoryContext.Provider>;
}

export default StoryProvider;
