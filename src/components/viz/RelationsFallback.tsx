"use client";

/**
 * RelationsFallback — the ultimate `arch`-slot floor (§9.6.3): the refactor-trace
 * relations panel + AI summary prose. Guarantees the architecture view is NEVER
 * blank. Renderer for the isFallback template.
 *
 * Reuses the SHARED RelationsPanel (subsystem E1, pinned props
 * `{ relations, onJump }`) and the shared sanitizing <Prose> renderer so the
 * fallback is visually identical to the level-0 relations surface.
 */
import type { Relation } from "@/lib/model/model";
import type { VizContext } from "@/lib/viz/registry";
import { RelationsPanel } from "@/components/review/level0/RelationsPanel";
import Prose from "@/components/review/Prose";

interface Props {
  relations: Relation[];
  summary: string;
  ctx: VizContext;
}

export default function RelationsFallback({ relations, summary, ctx }: Props) {
  return (
    <div className="arch-fallback" id="arch-diagram">
      {summary ? <Prose className="arch-fallback-summary" text={summary} as="p" /> : null}
      <RelationsPanel relations={relations} onJump={ctx.jump} />
    </div>
  );
}
