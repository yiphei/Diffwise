"use client";

/**
 * Level 0 — Intent (§7.5.0). Hero: eyebrow + title (sanitized), summary paragraph
 * (sanitized; collapses at level ≥2), the stat strip (`N files`, add/del bar,
 * `+a −d` — from the COMPUTED `stats` [C], never the LLM's numbers, §6.7), theme
 * chips (`themes[]`, color/glyph from `palette.KIND[kind]`), and the RelationsPanel.
 */
import type { Model, Relation } from "@/lib/model/model";
import { KIND } from "@/lib/review/palette";
import { Prose } from "@/components/review/Prose";
import { RelationsPanel } from "./RelationsPanel";

export interface IntentPanelProps {
  meta: Model["meta"] | undefined;
  stats: Model["stats"] | undefined;
  themes: Model["themes"] | undefined;
  relations: Relation[] | undefined;
  onJump(jump: string): void;
}

export default function IntentPanel({
  meta,
  stats,
  themes,
  relations,
  onJump,
}: IntentPanelProps): React.ReactElement {
  const filesChanged = stats?.filesChanged ?? 0;
  const additions = stats?.additions ?? 0;
  const deletions = stats?.deletions ?? 0;
  const total = additions + deletions;
  const addPct = total > 0 ? (additions / total) * 100 : 0;
  const delPct = total > 0 ? (deletions / total) * 100 : 0;

  return (
    <div className="intent-panel">
      <div className="eyebrow">Intent</div>
      <h1 className="intent-title">
        <Prose text={meta?.title ?? "Generating review…"} />
      </h1>

      <Prose as="p" className="summary intent-summary" text={meta?.summary} />

      <div className="stat-strip">
        <span className="stat-files">
          {filesChanged} {filesChanged === 1 ? "file" : "files"}
        </span>
        <span className="stat-bar" aria-hidden="true">
          <span className="stat-add" style={{ width: `${addPct}%` }} />
          <span className="stat-del" style={{ width: `${delPct}%` }} />
        </span>
        <span className="stat-nums">
          <span className="stat-add-num">+{additions}</span>
          <span className="stat-del-num">−{deletions}</span>
        </span>
      </div>

      {themes && themes.length > 0 && (
        <div className="themes">
          {themes.map((t, i) => {
            const s = KIND[t.kind];
            return (
              <span key={i} className="chip theme-chip" style={{ color: s.c, background: s.bg }}>
                {t.label}
              </span>
            );
          })}
        </div>
      )}

      <RelationsPanel relations={relations ?? []} onJump={onJump} />
    </div>
  );
}
