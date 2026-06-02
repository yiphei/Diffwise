"use client";

/**
 * useStoryKeyboard — global keydown handler, active ONLY while story is on
 * (§8.5). Mirrors the prototype and yields to focused form controls.
 *
 *   →  or  Space (when focus is NOT on a <button>)  -> next()
 *   ←                                               -> prev()
 *   Esc                                             -> exit()
 *   any other                                       -> ignored
 *
 * Rules:
 * - When focus is on a <button>, Space activates that button (so aside/nav
 *   disclosures stay accessible); → still advances regardless of focus.
 * - The normal level keymap is suppressed while story is active (the beat owns
 *   the level) — this handler simply doesn't forward other keys.
 * - Early-returns for INPUT/TEXTAREA/SELECT/contentEditable so typing is never
 *   hijacked.
 */
import { useEffect } from "react";

interface StoryKeyboardApi {
  active: boolean;
  next(): void;
  prev(): void;
  exit(): void;
}

function isFormControl(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function isButton(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && el.tagName === "BUTTON";
}

export function useStoryKeyboard({ active, next, prev, exit }: StoryKeyboardApi): void {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;

    const onKeyDown = (e: KeyboardEvent): void => {
      // Never hijack typing in form controls.
      if (isFormControl(e.target)) return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          next();
          break;
        case " ":
        case "Spacebar": // legacy key name
          // Space activates a focused button instead of advancing.
          if (isButton(e.target)) return;
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          prev();
          break;
        case "Escape":
          e.preventDefault();
          exit();
          break;
        default:
          // Any other key is ignored; does NOT fall through to the level keymap.
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, next, prev, exit]);
}

export default useStoryKeyboard;
