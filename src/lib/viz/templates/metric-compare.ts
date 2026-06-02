/**
 * T_METRIC_COMPARE — metric/behavior comparison fallback (§9.6).
 * A two-column table of named before/after metrics sourced from
 * arch.edges[].metric and from relations whose what/to chips read as a value
 * change. Renders "Before | After" rows with a change-kind accent.
 * applies(): score 0.2 when at least one before/after metric pair can be
 * derived.
 */
import type { ChangeKind, Model } from "@/lib/model/model";
import { register, type AppliesFn, type VizTemplate, type VizContext } from "@/lib/viz/registry";
import MetricCompare from "@/components/viz/MetricCompare";

export interface MetricCompareProps {
  rows: Array<{ label: string; before: string; after: string; kind: ChangeKind; jump?: string }>;
}

function jumpRefToString(t?: { file: string; sym?: string }): string | undefined {
  if (!t) return undefined;
  return t.sym ? `${t.file}#${t.sym}` : t.file;
}

/** Derive before/after rows. Empty rows => not applicable. */
function deriveRows(model: Model): MetricCompareProps["rows"] {
  const rows: MetricCompareProps["rows"] = [];

  // 1) arch.edges[].metric — explicit before/after value pairs.
  for (const e of model.arch.edges) {
    if (e.metric && (e.metric.before || e.metric.after)) {
      rows.push({
        label: e.label || e.type,
        before: e.metric.before,
        after: e.metric.after,
        kind: kindForEdge(model, e.type),
      });
    }
  }

  // 2) relations whose what/to chips read as a value change ("a = 1" -> "b = 2").
  for (const rel of model.relations) {
    for (const ed of rel.edges) {
      if (looksLikeValue(ed.what) || looksLikeValue(ed.to)) {
        rows.push({
          label: rel.title || rel.source || "change",
          before: ed.what,
          after: ed.to,
          kind: rel.tagKind,
          jump: jumpRefToString(ed.target),
        });
      }
    }
  }

  return rows;
}

/** Heuristic: a chip "reads as a value change" if it contains an assignment,
 *  comparison, or arrow token (deterministic, no parsing of code). */
function looksLikeValue(s: string): boolean {
  return /[=:<>]|->|=>/.test(s);
}

function kindForEdge(_model: Model, _type: string): ChangeKind {
  // Edges don't carry a ChangeKind; metric changes are "signature"-like.
  return "signature";
}

const applies: AppliesFn<MetricCompareProps> = ({ ctx }: { ctx: VizContext }) => {
  const rows = deriveRows(ctx.model);
  if (rows.length === 0) return { score: 0 };
  return { score: 0.2, props: { rows } };
};

export const T_METRIC_COMPARE: VizTemplate<MetricCompareProps> = {
  id: "arch.metric-compare",
  title: "Metric / behavior comparison",
  slot: "arch",
  propsName: "MetricCompareProps",
  applies,
  Renderer: MetricCompare,
};

register(T_METRIC_COMPARE);
