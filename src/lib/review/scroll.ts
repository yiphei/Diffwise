/**
 * Centralized scroll / flash / spotlight helpers (§7.6, §7.7, §8). All DOM-side
 * effects for deep-links, cross-links, and story beats funnel through here so the
 * timing + class names stay consistent with the prototype.
 *
 * - flash(el): transient .flash ring (~1.1s, prototype @keyframes flashring).
 * - spotlight(id): a SINGLE persistent .spotlight ring (clears any prior one).
 * - clearSpotlight(): remove the current spotlight.
 * - scrollToCenter(el): scrollIntoView({block:'center'}); honors reduced-motion.
 * - afterLayout(cb): wait for the CSS reveal transition (rAF + ~440ms fallback).
 */

const FLASH_MS = 1100;
const LAYOUT_FALLBACK_MS = 440;

/** Add a transient ring class that auto-removes after the animation. */
export function flash(el: Element): void {
  el.classList.remove("flash");
  // Force reflow so re-adding the class restarts the animation.
  void (el as HTMLElement).offsetWidth;
  el.classList.add("flash");
  window.setTimeout(() => {
    el.classList.remove("flash");
  }, FLASH_MS);
}

/** Set a single persistent spotlight ring, clearing any others first. */
export function spotlight(id: string | null): void {
  clearSpotlight();
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.classList.add("spotlight");
}

/** Remove all spotlight rings. */
export function clearSpotlight(): void {
  for (const el of Array.from(document.querySelectorAll(".spotlight"))) {
    el.classList.remove("spotlight");
  }
}

/** Scroll an element to the vertical center of the viewport. */
export function scrollToCenter(el: Element, reducedMotion?: boolean): void {
  el.scrollIntoView({
    block: "center",
    inline: "nearest",
    behavior: reducedMotion ? "auto" : "smooth",
  });
}

/**
 * Run `cb` after the current CSS level/reveal transition has had time to settle.
 * Uses a double requestAnimationFrame plus a transitionend listener on the stage,
 * with a hard ~440ms fallback so it always fires exactly once.
 */
export function afterLayout(cb: () => void): void {
  let done = false;
  const fire = (): void => {
    if (done) return;
    done = true;
    cleanup();
    cb();
  };

  const stage = document.querySelector("[data-level]");
  const onTransitionEnd = (): void => fire();

  const cleanup = (): void => {
    window.clearTimeout(timer);
    if (stage) stage.removeEventListener("transitionend", onTransitionEnd);
  };

  if (stage) stage.addEventListener("transitionend", onTransitionEnd);
  const timer = window.setTimeout(fire, LAYOUT_FALLBACK_MS);

  // Kick off after layout has been recomputed at least once.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Give the transition a tick to start; the fallback/transitionend will fire.
    });
  });
}
