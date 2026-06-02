"use client";

/**
 * StoryCard — the fixed bottom-center card (§8.3). 680px max width, slides
 * in/out via transform on body[data-story]. Counter + kind chip, sanitized
 * title/body (<Prose>), aside list, Prev/Next/Exit nav, and progress dots.
 *
 * Focus management (§8.5): the card is role="region" with an aria-label naming
 * the current step, and focus moves to its heading on each beat change so
 * screen-reader users track beat changes.
 */
import { useEffect, useRef } from "react";
import type { StoryBeat, ChangeKind } from "@/lib/model/model";
import { KIND } from "@/lib/review/palette";
import { sanitizeText } from "@/lib/sanitize";
import Prose from "@/components/review/Prose";
import StoryAside from "./StoryAside";

export interface StoryCardProps {
  beat: StoryBeat; // model.story[curBeat]
  index: number; // curBeat (0-based)
  total: number; // model.story.length
  kinds: StoryBeat["kind"][]; // model.story.map(b => b.kind) — for dot colors
  onPrev(): void;
  onNext(): void;
  onExit(): void;
  onJump(index: number): void; // dot click -> goto(index)
}

function kindStyle(kind: ChangeKind) {
  return KIND[kind] ?? KIND.modified;
}

export function StoryCard({
  beat,
  index,
  total,
  kinds,
  onPrev,
  onNext,
  onExit,
  onJump,
}: StoryCardProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const chip = kindStyle(beat.kind);

  // Move focus to the heading on each beat change (a11y — §8.5). The heading is
  // a wrapper around <Prose> so it stays focusable without forwarding a ref into
  // the sanitizing renderer.
  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  const atFirst = index <= 0;
  const atLast = index >= total - 1;

  return (
    <div
      className="story-card"
      role="region"
      aria-label={`Guided story, step ${index + 1} of ${total}`}
    >
      <div className="sc-top">
        <span className="sc-count">
          Step {index + 1} / {total}
        </span>
        <span className="ck" style={{ color: chip.c, background: chip.bg }}>
          {chip.label}
        </span>
      </div>

      <h4 className="sc-title-wrap" ref={headingRef} tabIndex={-1}>
        <Prose className="sc-title" as="span" text={beat.title} />
      </h4>
      <Prose className="sc-body" as="p" text={beat.body} />

      {beat.asides && beat.asides.length > 0 ? (
        <div className="sc-asides">
          {beat.asides.map((a, i) => (
            <StoryAside key={`${beat.id}-aside-${i}`} label={a.label} body={a.body} />
          ))}
        </div>
      ) : null}

      <div className="sc-nav">
        <button type="button" className="sc-prev" onClick={onPrev} disabled={atFirst}>
          ‹ Prev
        </button>
        <button type="button" className="sc-next" onClick={onNext} disabled={atLast}>
          Next ›
        </button>
        <button type="button" className="sc-exit" onClick={onExit}>
          Exit
        </button>
        <div className="sc-dots" role="tablist" aria-label="Story beats">
          {kinds.map((k, i) => {
            const dot = kindStyle(k);
            const isCur = i === index;
            // The current beat's title is shown as a plain-text tooltip; other
            // dots fall back to "Step N" (only `kinds` are passed per props).
            const title = sanitizeText(isCur ? beat.title : `Step ${i + 1}`);
            return (
              <button
                key={`dot-${i}`}
                type="button"
                className={`d${isCur ? " cur" : ""}`}
                title={title}
                aria-label={`Go to step ${i + 1}`}
                aria-selected={isCur}
                style={{ background: isCur ? dot.c : "var(--line)" }}
                onClick={() => onJump(i)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default StoryCard;
