"use client";

/**
 * Top bar (§7.1, §7.9). Title (model.meta.title), the current level label, a small
 * change-kind legend, the Story toggle, and the theme toggle (🌙/☀️). All reads
 * come from the store; toggles are pure client state changes.
 */
import { useReviewStore } from "@/components/review/state/useReviewStore";
import { KIND } from "@/lib/review/palette";
import { Prose } from "@/components/review/Prose";

const LEVEL_LABELS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "Intent",
  1: "Files",
  2: "Symbols",
  3: "Code",
  4: "Wiring",
};

const LEGEND_KINDS = ["added", "removed", "modified", "renamed"] as const;

export default function TopBar(): React.ReactElement {
  const title = useReviewStore((s) => s.model?.meta?.title);
  const level = useReviewStore((s) => s.level);
  const theme = useReviewStore((s) => s.theme);
  const hasStory = useReviewStore((s) => (s.model?.story?.length ?? 0) > 0);
  const storyActive = useReviewStore((s) => s.story.active);
  const setTheme = useReviewStore((s) => s.setTheme);
  const enterStory = useReviewStore((s) => s.enterStory);
  const exitStory = useReviewStore((s) => s.exitStory);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="brand">Diffwise</span>
        <span className="topbar-title">
          <Prose text={title ?? ""} />
        </span>
        <span className="level-chip">L{level} · {LEVEL_LABELS[level]}</span>
      </div>

      <div className="topbar-right">
        <span className="legend" aria-hidden="true">
          {LEGEND_KINDS.map((k) => (
            <span key={k} className="legend-item">
              <span className="legend-dot" style={{ background: KIND[k].c }} />
              {KIND[k].label}
            </span>
          ))}
        </span>

        {hasStory && (
          <button
            type="button"
            className={`story-toggle${storyActive ? " active" : ""}`}
            aria-pressed={storyActive}
            onClick={() => (storyActive ? exitStory() : enterStory())}
          >
            {storyActive ? "Exit story" : "Story"}
          </button>
        )}

        <button
          type="button"
          className="theme-toggle"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
    </header>
  );
}
