"use client";

/**
 * Top-level review shell (§7.2). Owns the store lifecycle: kicks off generation
 * from its repo/prNumber props, renders TopBar + ZoomRail + Stage, mounts the
 * StoryController (§8), and wires the cross-cutting concerns:
 *   - hashchange ↔ level + element (§7.6)
 *   - global keyboard nav (§7.8)
 *   - theme `data-theme` on <html> (§7.9)
 *   - reduced-motion read once into the store (§7.11)
 *   - a delegated document-level click handler for `[data-jump]` (§7.7)
 *
 * Story-mode keys are owned by §8 when story is active; this handler defers to it.
 */
import { useEffect, useRef } from "react";
import { useReviewStore, type Level } from "@/components/review/state/useReviewStore";
import TopBar from "@/components/review/TopBar";
import ZoomRail from "@/components/review/ZoomRail";
import Stage from "@/components/review/Stage";
import StoryController from "@/components/story/StoryController";

export interface ReviewShellProps {
  repo: string;
  prNumber: number;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export default function ReviewShell({ repo, prNumber }: ReviewShellProps): React.ReactElement {
  const startGeneration = useReviewStore((s) => s.startGeneration);
  const setLevel = useReviewStore((s) => s.setLevel);
  const applyHash = useReviewStore((s) => s.applyHash);
  const jumpTo = useReviewStore((s) => s.jumpTo);
  const setTheme = useReviewStore((s) => s.setTheme);
  const setReducedMotion = useReviewStore((s) => s.setReducedMotion);
  const status = useReviewStore((s) => s.status);
  const theme = useReviewStore((s) => s.theme);
  const storyActive = useReviewStore((s) => s.story.active);

  const startedRef = useRef(false);
  const storyActiveRef = useRef(storyActive);
  storyActiveRef.current = storyActive;

  // Kick off the generation once from props.
  useEffect(() => {
    if (startedRef.current) return;
    if (!repo || !Number.isFinite(prNumber) || prNumber <= 0) return;
    startedRef.current = true;
    startGeneration({ repo, prNumber });
  }, [repo, prNumber, startGeneration]);

  // Apply the theme attribute to <html> on mount + change (§7.9).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Reduced-motion: read once, then track changes (§7.11).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setReducedMotion]);

  // Apply initial hash + listen for hashchange (browser back) (§7.6).
  useEffect(() => {
    if (window.location.hash) applyHash(window.location.hash);
    const onHash = (): void => applyHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [applyHash]);

  // Global keyboard navigation (§7.8) — deferred to §8 when story is active.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (storyActiveRef.current) return; // story owns keys when active
      if (isTypingTarget(e.target)) return; // focus guard

      const level = useReviewStore.getState().level;
      switch (e.key) {
        case "ArrowUp":
        case "+":
        case "=":
          e.preventDefault();
          setLevel(Math.min(4, level + 1) as Level);
          break;
        case "ArrowDown":
        case "-":
        case "_":
          e.preventDefault();
          setLevel(Math.max(0, level - 1) as Level);
          break;
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
          e.preventDefault();
          setLevel(Number(e.key) as Level);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setLevel]);

  // Shift + wheel → zoom (accumulator ±60 per detent), preventDefault (§7.8).
  useEffect(() => {
    let accum = 0;
    const onWheel = (e: WheelEvent): void => {
      if (!e.shiftKey) return;
      if (storyActiveRef.current) return;
      e.preventDefault();
      accum += e.deltaY;
      const level = useReviewStore.getState().level;
      if (accum >= 60) {
        accum = 0;
        setLevel(Math.max(0, level - 1) as Level);
      } else if (accum <= -60) {
        accum = 0;
        setLevel(Math.min(4, level + 1) as Level);
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [setLevel]);

  // Delegated [data-jump] click handler (§7.7).
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      const jumper = target?.closest("[data-jump]") as HTMLElement | null;
      if (!jumper) return;
      const jump = jumper.getAttribute("data-jump");
      if (!jump) return;
      e.preventDefault();
      jumpTo(jump);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [jumpTo]);

  return (
    <div className="review-shell">
      <TopBar />
      <ZoomRail />
      <Stage />
      <StoryController />
      <StatusOverlay
        phase={status.phase}
        message={status.phase === "error" ? status.message : undefined}
        canRegenerate={status.phase === "error"}
        onRegenerate={() => startGeneration({ repo, prNumber })}
      />
    </div>
  );
}

/** Lightweight streaming/error overlay (full estimate UX lives in M5). */
function StatusOverlay({
  phase,
  message,
  canRegenerate,
  onRegenerate,
}: {
  phase: string;
  message?: string;
  canRegenerate: boolean;
  onRegenerate(): void;
}): React.ReactElement | null {
  if (phase === "ready" || phase === "idle") return null;
  return (
    <div className="status-overlay" role="status" aria-live="polite">
      {phase === "error" ? (
        <div className="status-error">
          <p className="status-msg">{message ?? "Something went wrong."}</p>
          {canRegenerate && (
            <button type="button" className="regenerate" onClick={onRegenerate}>
              Regenerate
            </button>
          )}
        </div>
      ) : (
        <div className="status-busy">
          <span className="spinner" aria-hidden="true" />
          <span className="status-msg">
            {phase === "estimating"
              ? "Estimating…"
              : phase === "validating"
                ? "Validating…"
                : "Generating review…"}
          </span>
        </div>
      )}
    </div>
  );
}
