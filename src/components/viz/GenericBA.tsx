"use client";

/**
 * GenericBA — generic before/after two-column fallback (§9.6.1).
 * Renderer for T_GENERIC_BA. No SVG layout math — pure flexbox. Left column =
 * entities that existed/were removed; right column = what exists/was added;
 * a middle band shows responsibilities that moved (from relations). Reuses the
 * same xlink jump affordance.
 */
import type { ChangeKind } from "@/lib/model/model";
import type { VizContext } from "@/lib/viz/registry";
import { KIND } from "@/lib/review/palette";

interface Entity {
  label: string;
  kind: ChangeKind;
  jump?: string;
}
interface Moved {
  what: string;
  to: string;
  jump?: string;
}

interface Props {
  before: Entity[];
  after: Entity[];
  moved: Moved[];
  ctx: VizContext;
}

function Chip({ e, onJump }: { e: Entity; onJump: (ref: string) => void }) {
  const palette = KIND[e.kind] ?? KIND.modified;
  const style: React.CSSProperties = {
    color: palette.c,
    background: palette.bg,
    borderColor: palette.c,
  };
  if (e.jump) {
    return (
      <button
        type="button"
        className="xlink ba-chip"
        style={style}
        onClick={() => e.jump && onJump(e.jump)}
      >
        {e.label}
      </button>
    );
  }
  return (
    <span className="ba-chip" style={style}>
      {e.label}
    </span>
  );
}

export default function GenericBA({ before, after, moved, ctx }: Props) {
  return (
    <div className="generic-ba" id="arch-diagram">
      <div className="ba-columns" style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
        <section className="ba-col ba-before" style={{ flex: 1 }}>
          <h4 className="ba-col-head">Before</h4>
          <div className="ba-chips" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {before.length === 0 ? (
              <span className="ba-empty">—</span>
            ) : (
              before.map((e, i) => <Chip key={`b-${e.label}-${i}`} e={e} onJump={ctx.jump} />)
            )}
          </div>
        </section>

        <div className="ba-arrow" aria-hidden="true" style={{ alignSelf: "center" }}>
          →
        </div>

        <section className="ba-col ba-after" style={{ flex: 1 }}>
          <h4 className="ba-col-head">After</h4>
          <div className="ba-chips" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {after.length === 0 ? (
              <span className="ba-empty">—</span>
            ) : (
              after.map((e, i) => <Chip key={`a-${e.label}-${i}`} e={e} onJump={ctx.jump} />)
            )}
          </div>
        </section>
      </div>

      {moved.length > 0 ? (
        <div className="ba-moved" aria-label="Responsibilities moved">
          <h4 className="ba-col-head">Moved</h4>
          <ul className="ba-moved-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {moved.map((m, i) => (
              <li
                key={`m-${m.what}-${i}`}
                className="ba-moved-row"
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <span className="ba-moved-what">{m.what}</span>
                <span className="ba-moved-sep" aria-hidden="true">
                  →
                </span>
                {m.jump ? (
                  <button
                    type="button"
                    className="xlink ba-moved-to"
                    onClick={() => m.jump && ctx.jump(m.jump)}
                  >
                    {m.to}
                  </button>
                ) : (
                  <span className="ba-moved-to">{m.to}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
