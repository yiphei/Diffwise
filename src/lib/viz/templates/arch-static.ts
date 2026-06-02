/**
 * T_ARCH_STATIC — the static before/after node diagram (§9.4).
 * applies(): score 1 when arch.nodes.length > 0; else score 0 (falls through to
 * the generic fallback chain — §9.5/§9.6).
 */
import type { Arch } from "@/lib/model/model";
import { register, type AppliesFn, type VizTemplate } from "@/lib/viz/registry";
import ArchDiagram from "@/components/viz/ArchDiagram";

export interface ArchStaticProps {
  arch: Arch; // validated: edge endpoints ∈ nodes, jumps resolve (§6.6)
  initialState: "before" | "after"; // defaults to 'after'
}

function isArch(data: unknown): data is Arch {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as Arch).nodes) &&
    Array.isArray((data as Arch).edges)
  );
}

const applies: AppliesFn<ArchStaticProps> = ({ data }) => {
  if (!isArch(data) || data.nodes.length === 0) return { score: 0 };
  return { score: 1, props: { arch: data, initialState: "after" } };
};

export const T_ARCH_STATIC: VizTemplate<ArchStaticProps> = {
  id: "arch.static",
  title: "Static architecture (before/after)",
  slot: "arch",
  propsName: "ArchStaticProps",
  applies,
  Renderer: ArchDiagram,
};

register(T_ARCH_STATIC);
