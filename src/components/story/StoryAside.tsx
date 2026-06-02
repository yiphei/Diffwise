"use client";

/**
 * StoryAside — one click-to-reveal "why" aside (§8.3). The dashed-border button
 * (`.why`, rotating `›` chevron) reveals `.abody`. Each aside is an independent
 * toggle: toggling one never affects another and never advances the beat. Both
 * label and body are untrusted prose -> rendered via the sanitizing <Prose>.
 */
import { useId, useState } from "react";
import Prose from "@/components/review/Prose";

export interface StoryAsideProps {
  label: string; // the "why?" question (button face) — sanitized
  body: string; // the revealed answer — sanitized
}

export function StoryAside({ label, body }: StoryAsideProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <div className={`aside-item${open ? " open" : ""}`}>
      <button
        type="button"
        className="why"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="why-chevron" aria-hidden="true">
          ›
        </span>
        <Prose className="why-label" text={label} as="span" />
      </button>
      <div id={bodyId} className="abody-wrap" hidden={!open}>
        {open ? <Prose className="abody" text={body} as="div" /> : null}
      </div>
    </div>
  );
}

export default StoryAside;
