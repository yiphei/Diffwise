"use client";

/**
 * ArchDiagram — STATIC before/after architecture SVG (§9.4).
 *
 * Renderer for T_ARCH_STATIC. NO animation: two discrete states (before/after)
 * and a Before/After toggle that swaps between them. The morph/scrubber is
 * DEFERRED to phase 2 (LOCKED).
 *
 * - viewBox 0 0 1000 560, preserveAspectRatio xMidYMid meet
 * - node center = states[S].{x*1000, y*560}; drawn iff present
 * - shape: 'state' -> ellipse rx68 ry30; else rounded rect 158x54 rx12;
 *   'ext' adds dasharray; unknown -> module
 * - fill/stroke from KIND[node.kind]
 * - edge drawn iff states[S].present; endpoints honor per-state from/to
 *   overrides; quadratic bezier; stroke EDGECOLOR[type] ?? '#888'; chip =
 *   metric?.[S] else label; degenerate self-loop (|to-from|<6) hidden
 * - node click -> caption (label/sub/detail/'open code'->ctx.jump) + dim
 *   non-incident; clicking empty space clears selection
 * - netEffect chips below call ctx.jump
 */
import { useMemo, useState } from "react";
import type { Arch, ArchNode, ArchEdge } from "@/lib/model/model";
import type { VizContext } from "@/lib/viz/registry";
import { KIND, EDGECOLOR } from "@/lib/review/palette";
import Prose from "@/components/review/Prose";
import { splitFileSym } from "@/lib/model/validate";

interface Props {
  arch: Arch;
  initialState: "before" | "after";
  ctx: VizContext;
}

const VW = 1000;
const VH = 560;
const RECT_W = 158;
const RECT_H = 54;
const RECT_RX = 12;
const ELLIPSE_RX = 68;
const ELLIPSE_RY = 30;

type StateKey = "before" | "after";

interface Pt {
  x: number;
  y: number;
}

function nodeCenter(node: ArchNode, s: StateKey): Pt {
  const st = node.states[s];
  return { x: st.x * VW, y: st.y * VH };
}

/** Quadratic Bézier evaluated at parameter t (0..1). */
function qbez(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
  };
}

/** Control point for the curve: midpoint pushed perpendicular for a gentle bow. */
function controlPoint(from: Pt, to: Pt): Pt {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular unit vector, bow amount proportional to length (clamped)
  const bow = Math.min(60, len * 0.18);
  return { x: mx + (-dy / len) * bow, y: my + (dx / len) * bow };
}

function isExtShape(shape: string): boolean {
  return shape === "ext";
}
function isStateShape(shape: string): boolean {
  return shape === "state";
}

export default function ArchDiagram({ arch, initialState, ctx }: Props) {
  const [state, setState] = useState<StateKey>(initialState ?? "after");
  const [selected, setSelected] = useState<string | null>(null);

  const nodeById = useMemo(() => {
    const m = new Map<string, ArchNode>();
    for (const n of arch.nodes) m.set(n.id, n);
    return m;
  }, [arch.nodes]);

  // Visible nodes/edges for the current state.
  const visibleNodes = arch.nodes.filter((n) => n.states[state].present);
  const visibleEdges = arch.edges.filter((e) => e.states[state].present);

  // Incidence: which nodes/edges touch the selected node (§9.4 dim non-incident).
  const incidence = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    if (!selected) return { nodes, edges };
    nodes.add(selected);
    for (const e of arch.edges) {
      const from = e.states[state].from ?? e.from;
      const to = e.states[state].to ?? e.to;
      if (from === selected || to === selected) {
        edges.add(e.id);
        nodes.add(from);
        nodes.add(to);
      }
    }
    return { nodes, edges };
  }, [selected, arch.edges, state]);

  const dimNode = (id: string) => selected !== null && !incidence.nodes.has(id);
  const dimEdge = (e: ArchEdge) => selected !== null && !incidence.edges.has(e.id);

  const selectedNode = selected ? nodeById.get(selected) ?? null : null;

  // Caption detail: linked Symbol.detail if jump resolves, else node.caption.
  const captionDetail = useMemo(() => {
    if (!selectedNode) return "";
    if (selectedNode.jump) {
      const { file, sym } = splitFileSym(selectedNode.jump);
      const mf = ctx.model.files.find((f) => f.path === file);
      if (mf && sym) {
        const symObj = mf.symbols.find((s) => s.name === sym);
        if (symObj && symObj.detail) return symObj.detail;
      }
    }
    return selectedNode.caption ?? "";
  }, [selectedNode, ctx.model.files]);

  return (
    <div className="arch-diagram" id="arch-diagram">
      <div className="arch-toolbar" role="group" aria-label="Architecture state">
        <button
          type="button"
          className="arch-seg"
          data-t="before"
          aria-pressed={state === "before"}
          onClick={() => {
            setState("before");
            setSelected(null);
          }}
        >
          Before
        </button>
        <button
          type="button"
          className="arch-seg"
          data-t="after"
          aria-pressed={state === "after"}
          onClick={() => {
            setState("after");
            setSelected(null);
          }}
        >
          After
        </button>
      </div>

      <div className="arch-canvas" style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          role="img"
          aria-label={`Architecture diagram (${state})`}
          onClick={() => setSelected(null)}
        >
          <defs>
            {arch.edges.map((e) => {
              const color = EDGECOLOR[e.type] ?? "#888";
              return (
                <marker
                  key={`m-${e.id}`}
                  id={`arrow-${e.id}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill={color} />
                </marker>
              );
            })}
          </defs>

          {/* Edges first (under nodes) */}
          <g className="arch-edges">
            {visibleEdges.map((e) => {
              const fromId = e.states[state].from ?? e.from;
              const toId = e.states[state].to ?? e.to;
              const fn = nodeById.get(fromId);
              const tn = nodeById.get(toId);
              if (!fn || !tn) return null;
              const p0 = nodeCenter(fn, state);
              const p1 = nodeCenter(tn, state);
              // hide degenerate self-loops (|to - from| < 6)
              if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 6) return null;
              const c = controlPoint(p0, p1);
              const color = EDGECOLOR[e.type] ?? "#888";
              const mid = qbez(p0, c, p1, 0.5);
              const chip = (e.metric ? e.metric[state] : "") || e.label;
              const dimmed = dimEdge(e);
              return (
                <g key={e.id} opacity={dimmed ? 0.18 : 1} style={{ transition: "opacity 180ms" }}>
                  <path
                    d={`M ${p0.x} ${p0.y} Q ${c.x} ${c.y} ${p1.x} ${p1.y}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    markerEnd={`url(#arrow-${e.id})`}
                  />
                  {chip ? (
                    <g>
                      <rect
                        x={mid.x - measureChip(chip) / 2}
                        y={mid.y - 11}
                        width={measureChip(chip)}
                        height={20}
                        rx={6}
                        fill="var(--bg, #fff)"
                        stroke={color}
                        strokeWidth={1}
                      />
                      <text
                        x={mid.x}
                        y={mid.y + 3}
                        textAnchor="middle"
                        fontSize={11}
                        fill={color}
                        style={{ fontFamily: "var(--mono, monospace)" }}
                      >
                        {chip}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* Nodes */}
          <g className="arch-nodes">
            {visibleNodes.map((n) => {
              const center = nodeCenter(n, state);
              const palette = KIND[n.kind] ?? KIND.modified;
              const dimmed = dimNode(n.id);
              const isSel = selected === n.id;
              const ext = isExtShape(n.shape);
              const stateShape = isStateShape(n.shape);
              const dash = ext ? "5 4" : undefined;
              return (
                <g
                  key={n.id}
                  className="arch-node"
                  data-node={n.id}
                  opacity={dimmed ? 0.22 : 1}
                  style={{ cursor: "pointer", transition: "opacity 180ms" }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setSelected(isSel ? null : n.id);
                  }}
                >
                  {stateShape ? (
                    <ellipse
                      cx={center.x}
                      cy={center.y}
                      rx={ELLIPSE_RX}
                      ry={ELLIPSE_RY}
                      fill={palette.bg}
                      stroke={palette.c}
                      strokeWidth={isSel ? 3 : 2}
                      strokeDasharray={dash}
                    />
                  ) : (
                    <rect
                      x={center.x - RECT_W / 2}
                      y={center.y - RECT_H / 2}
                      width={RECT_W}
                      height={RECT_H}
                      rx={RECT_RX}
                      fill={palette.bg}
                      stroke={palette.c}
                      strokeWidth={isSel ? 3 : 2}
                      strokeDasharray={dash}
                    />
                  )}
                  <text
                    x={center.x}
                    y={center.y - 2}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={600}
                    fill={palette.c}
                  >
                    {clip(n.label, 20)}
                  </text>
                  {n.sub ? (
                    <text
                      x={center.x}
                      y={center.y + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill={palette.c}
                      opacity={0.8}
                    >
                      {clip(n.sub, 24)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {selectedNode ? (
          <div className="arch-caption" role="status" style={captionStyle(selectedNode, state)}>
            <div className="arch-caption-head">
              <b>{selectedNode.label}</b>
              {selectedNode.sub ? <span className="arch-caption-sub"> {selectedNode.sub}</span> : null}
            </div>
            {captionDetail ? (
              <Prose className="arch-caption-detail" text={captionDetail} as="div" />
            ) : null}
            {selectedNode.jump ? (
              <button
                type="button"
                className="arch-open-code xlink"
                onClick={() => {
                  if (selectedNode.jump) ctx.jump(selectedNode.jump);
                }}
              >
                open code →
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {arch.netEffect.length > 0 ? (
        <div className="arch-net-effect" aria-label="Net effect">
          {arch.netEffect.map((ne, i) => {
            const palette = KIND[ne.kind] ?? KIND.modified;
            return (
              <button
                key={`${ne.label}-${i}`}
                type="button"
                className="xlink arch-net-chip"
                style={{ color: palette.c, background: palette.bg, borderColor: palette.c }}
                disabled={!ne.jump}
                onClick={() => {
                  if (ne.jump) ctx.jump(ne.jump);
                }}
              >
                {ne.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Approximate chip pill width from text length (deterministic, no DOM measure). */
function measureChip(s: string): number {
  return Math.max(28, s.length * 6.5 + 14);
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Position the caption near the selected node (in % of the canvas box). */
function captionStyle(node: ArchNode, s: StateKey): React.CSSProperties {
  const st = node.states[s];
  const leftPct = Math.min(70, Math.max(2, st.x * 100));
  const topPct = Math.min(80, Math.max(2, st.y * 100 + 6));
  return {
    position: "absolute",
    left: `${leftPct}%`,
    top: `${topPct}%`,
    maxWidth: "280px",
    zIndex: 4,
  };
}
