"use client";

/**
 * MetricCompare — Before|After rows table with a change-kind accent (§9.6.2).
 * Renderer for T_METRIC_COMPARE. Useful for signature/threshold/behavioral
 * changes that have no spatial topology. All values are rendered as text.
 */
import type { ChangeKind } from "@/lib/model/model";
import type { VizContext } from "@/lib/viz/registry";
import { KIND } from "@/lib/review/palette";

interface Row {
  label: string;
  before: string;
  after: string;
  kind: ChangeKind;
  jump?: string;
}

interface Props {
  rows: Row[];
  ctx: VizContext;
}

export default function MetricCompare({ rows, ctx }: Props) {
  return (
    <div className="metric-compare" id="arch-diagram">
      <table className="mc-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th className="mc-th mc-label" style={{ textAlign: "left" }}>
              What
            </th>
            <th className="mc-th mc-before" style={{ textAlign: "left" }}>
              Before
            </th>
            <th className="mc-th mc-after" style={{ textAlign: "left" }}>
              After
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const palette = KIND[r.kind] ?? KIND.modified;
            return (
              <tr key={`r-${r.label}-${i}`} className="mc-row" style={{ borderLeft: `3px solid ${palette.c}` }}>
                <td className="mc-cell mc-label">
                  {r.jump ? (
                    <button
                      type="button"
                      className="xlink"
                      style={{ color: palette.c }}
                      onClick={() => r.jump && ctx.jump(r.jump)}
                    >
                      {r.label}
                    </button>
                  ) : (
                    <span style={{ color: palette.c }}>{r.label}</span>
                  )}
                </td>
                <td className="mc-cell mc-before" style={{ fontFamily: "var(--mono, monospace)" }}>
                  {r.before || "—"}
                </td>
                <td className="mc-cell mc-after" style={{ fontFamily: "var(--mono, monospace)" }}>
                  {r.after || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
