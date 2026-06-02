/**
 * Ultimate fallback for the `arch` slot (§9.6.3): relations panel + AI prose.
 * isFallback: true — its applies() ALWAYS returns a usable props object, so
 * selectTemplate can never return null for the `arch` slot. This is the LOCKED
 * graceful-degradation rule ("never a blank").
 */
import type { Relation } from "@/lib/model/model";
import { register, type AppliesFn, type VizTemplate, type VizContext } from "@/lib/viz/registry";
import RelationsFallback from "@/components/viz/RelationsFallback";

export interface RelationsFallbackProps {
  relations: Relation[];
  summary: string; // model.meta.summary (sanitized at render by <Prose>)
}

const applies: AppliesFn<RelationsFallbackProps> = ({ ctx }: { ctx: VizContext }) => ({
  // score is ignored for the fallback, but it must always return usable props.
  score: 1,
  props: {
    relations: ctx.model.relations,
    summary: ctx.model.meta.summary,
  },
});

export const T_RELATIONS_FALLBACK: VizTemplate<RelationsFallbackProps> = {
  id: "arch.relations-fallback",
  title: "Relations + summary (fallback)",
  slot: "arch",
  propsName: "RelationsFallbackProps",
  applies,
  Renderer: RelationsFallback,
  isFallback: true,
};

register(T_RELATIONS_FALLBACK);
