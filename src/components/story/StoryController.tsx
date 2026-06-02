"use client";

/**
 * StoryController — the glue mounted by ReviewShell (§8.1). It wraps the story
 * state machine (StoryProvider) and, when active, renders the StoryCard +
 * binds the global keyboard handler. It reads model.story + store.story through
 * the provider's StoryApi.
 *
 * Renders nothing visible when the story is inactive (the toolbar Story button —
 * owned by the shell — calls store.enterStory()/exitStory()). On exit it also
 * restores focus to that toolbar button when present.
 */
import { useEffect, useRef } from "react";
import StoryProvider, { useStory } from "./StoryProvider";
import StoryCard from "./StoryCard";
import useStoryKeyboard from "./useStoryKeyboard";

function StoryControllerInner() {
  const story = useStory();
  const wasActive = useRef(false);

  // The provider may be null only if rendered outside the provider; it is not.
  const active = story?.state.isActive ?? false;
  const beats = story?.beats ?? [];
  const curBeat = story?.state.curBeat ?? 0;

  useStoryKeyboard({
    active,
    next: () => story?.next(),
    prev: () => story?.prev(),
    exit: () => story?.exit(),
  });

  // Restore focus to the toolbar Story button on exit (§8.5 a11y).
  useEffect(() => {
    if (wasActive.current && !active && typeof document !== "undefined") {
      const btn = document.querySelector<HTMLElement>("[data-story-toggle]");
      btn?.focus();
    }
    wasActive.current = active;
  }, [active]);

  if (!active || beats.length === 0 || !story) return null;

  const clamped = Math.max(0, Math.min(curBeat, beats.length - 1));
  const beat = beats[clamped];
  if (!beat) return null;

  return (
    <StoryCard
      beat={beat}
      index={clamped}
      total={beats.length}
      kinds={beats.map((b) => b.kind)}
      onPrev={() => story.prev()}
      onNext={() => story.next()}
      onExit={() => story.exit()}
      onJump={(i) => story.goto(i)}
    />
  );
}

export default function StoryController() {
  return (
    <StoryProvider>
      <StoryControllerInner />
    </StoryProvider>
  );
}
