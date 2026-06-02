"use client";

/**
 * Level 0 — refactor-trace panel (§7.5.0). Renders each Relation as a card: tag
 * (`tagKind`), `title`, the `source` chip (a cross-link when `sourceTarget` is
 * present), and one `edge` row per `edges[]` entry — `what` (left/red) `→` `to`
 * (right/green), the `to` chip a cross-link when `target` is present.
 *
 * Cross-links call `onJump` with `${target.file}#${target.sym}` (§7.7). This panel
 * is ALSO the spotlight target for story beats with `target.type === 'relations'`
 * (§8) — hence the stable id `relations-panel`. NAMED export reused by E2.
 */
import type { Relation, JumpRef } from "@/lib/model/model";
import { KIND } from "@/lib/review/palette";
import { Prose } from "@/components/review/Prose";

export interface RelationsPanelProps {
  relations: Relation[];
  onJump(jump: string): void;
}

function jumpRefToString(ref: JumpRef): string {
  return `${ref.file}#${ref.sym}`;
}

export function RelationsPanel({ relations, onJump }: RelationsPanelProps): React.ReactElement {
  if (!relations || relations.length === 0) {
    return (
      <div id="relations-panel" className="relations">
        <div className="relations-empty">No cross-file relationships detected.</div>
      </div>
    );
  }

  return (
    <div id="relations-panel" className="relations">
      {relations.map((rel, i) => {
        const tag = KIND[rel.tagKind];
        return (
          <article key={i} className="relation-card">
            <header className="relation-head">
              <span className="chip" style={{ color: tag.c, background: tag.bg }}>
                {tag.label}
              </span>
              <Prose as="span" className="relation-title" text={rel.title} />
            </header>

            <div className="relation-source">
              {rel.sourceTarget ? (
                <button
                  type="button"
                  className="xlink"
                  data-jump={jumpRefToString(rel.sourceTarget)}
                  onClick={() => onJump(jumpRefToString(rel.sourceTarget!))}
                >
                  {rel.source}
                </button>
              ) : (
                <span className="relation-source-label">{rel.source}</span>
              )}
            </div>

            <ul className="relation-edges">
              {rel.edges.map((edge, j) => (
                <li key={j} className="relation-edge">
                  <span className="edge-what">{edge.what}</span>
                  <span className="edge-arrow" aria-hidden="true">
                    →
                  </span>
                  {edge.target ? (
                    <button
                      type="button"
                      className="xlink edge-to"
                      data-jump={jumpRefToString(edge.target)}
                      onClick={() => onJump(jumpRefToString(edge.target!))}
                    >
                      {edge.to}
                    </button>
                  ) : (
                    <span className="edge-to">{edge.to}</span>
                  )}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

export default RelationsPanel;
