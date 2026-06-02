/**
 * Beat -> shell driver (§8.4). `goto(i)` calls driveBeat(beat) which (a) forces
 * the zoom level the beat's TARGET declares (target-based level wins, §8.6),
 * (b) resolves beat.target to a DOM element, and (c) spotlights + scrolls to it.
 *
 * v1 form of the prototype's gotoBeat with 'archNode'/'demo' removed and `path`
 * renamed to `file`. DOM ids come from the canonical @/lib/review/ids builders
 * (symbolDomId/fileDomId) so story spotlights and deep-links resolve to the
 * IDENTICAL id.
 */
import type { StoryBeat } from "@/lib/model/model";
import { symbolDomId, fileDomId } from "@/lib/review/ids";

export interface ShellCtl {
  setLevel(l: 0 | 1 | 2 | 3 | 4): void;
  selectArchNode(id: string | null): void;
  /** Runs cb after the level transition settles (~440ms / transitionend). */
  afterLayout(cb: () => void): void;
  /** matchMedia('(prefers-reduced-motion: reduce)'). */
  reduceMotion: boolean;
}

/** Add a persistent ring to one element and clear all others. */
export type SpotlightFn = (id: string | null) => void;

/**
 * Scroll the resolved element into view (centered) and ring it. If a child
 * selector is given, scroll that child (e.g. the sym-head, not the whole sym
 * block). A missing id is a graceful no-op (§8.6) — the card still shows prose.
 */
function scrollSpot(
  id: string,
  childSel: string | null,
  behavior: ScrollBehavior,
  spotlight: SpotlightFn,
): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return; // resolved id missing => no-op (§8.6)
  spotlight(id); // adds .spotlight ring class to el
  const scrollTarget = (childSel && el.querySelector(childSel)) || el;
  scrollTarget.scrollIntoView({ block: "center", behavior });
}

/**
 * Force the level the target declares, resolve the DOM element, spotlight +
 * scroll. Target-based level mapping is authoritative (§8.6):
 *   relations -> 0,  arch -> 4,  symbol -> 3,  file -> 1.
 */
export function driveBeat(beat: StoryBeat, shell: ShellCtl, spotlight: SpotlightFn): void {
  const t = beat.target;
  spotlight(null); // clear stale ring first
  const behavior: ScrollBehavior = shell.reduceMotion ? "auto" : "smooth";

  switch (t.type) {
    case "relations":
      shell.setLevel(0); // beat.level is also 0; target wins
      shell.afterLayout(() =>
        scrollSpot("relations-panel", ".rel:first-child", behavior, spotlight),
      );
      break;

    case "arch":
      shell.setLevel(4);
      shell.selectArchNode(null); // arch is STATIC in v1: no replay/scrubber
      shell.afterLayout(() => scrollSpot("arch-diagram", null, behavior, spotlight));
      break;

    case "symbol":
      shell.setLevel(3); // symbol => code level (matches prototype)
      shell.afterLayout(() =>
        scrollSpot(symbolDomId(t.file, t.name), ".sym-head", behavior, spotlight),
      );
      break;

    case "file":
      shell.setLevel(1);
      shell.afterLayout(() => scrollSpot(fileDomId(t.file), null, behavior, spotlight));
      break;
  }
}
