"use client";

/**
 * The map-style detent rail (§7.1, §7.8, §7.10). Detents run 4→0 (Wiring … Intent)
 * plus zoom +/- buttons. Detents and buttons are real <button>s (tab-focusable,
 * aria-label); the rail has aria-label="Detail level" and the active detent gets
 * aria-current. On mobile it renders as a horizontal bottom bar (CSS, §7.10).
 */
import { useReviewStore, type Level } from "@/components/review/state/useReviewStore";

interface Detent {
  level: Level;
  label: string;
}

// Top-to-bottom: 4 (Wiring) … 0 (Intent) — matches the prototype's map rail.
const DETENTS: Detent[] = [
  { level: 4, label: "Wiring" },
  { level: 3, label: "Code" },
  { level: 2, label: "Symbols" },
  { level: 1, label: "Files" },
  { level: 0, label: "Intent" },
];

export default function ZoomRail(): React.ReactElement {
  const level = useReviewStore((s) => s.level);
  const setLevel = useReviewStore((s) => s.setLevel);

  const zoomIn = (): void => setLevel(Math.min(4, level + 1) as Level);
  const zoomOut = (): void => setLevel(Math.max(0, level - 1) as Level);

  return (
    <nav className="zoom-rail" aria-label="Detail level">
      <button
        type="button"
        className="rail-btn rail-plus"
        aria-label="Zoom in (more detail)"
        disabled={level >= 4}
        onClick={zoomIn}
      >
        +
      </button>

      <ol className="rail-detents">
        {DETENTS.map((d) => {
          const active = d.level === level;
          return (
            <li key={d.level}>
              <button
                type="button"
                className={`detent${active ? " active" : ""}`}
                aria-label={`Level ${d.level}: ${d.label}`}
                aria-current={active ? "true" : undefined}
                onClick={() => setLevel(d.level)}
              >
                <span className="detent-dot" aria-hidden="true" />
                <span className="detent-label">{d.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        className="rail-btn rail-minus"
        aria-label="Zoom out (less detail)"
        disabled={level <= 0}
        onClick={zoomOut}
      >
        −
      </button>
    </nav>
  );
}
