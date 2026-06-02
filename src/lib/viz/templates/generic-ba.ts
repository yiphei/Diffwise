/**
 * T_GENERIC_BA — generic before/after fallback (§9.6).
 * A degraded two-column "before -> after" view synthesized WITHOUT node
 * coordinates: left = entities that existed/were removed, right = what
 * exists/was added, middle = responsibilities that moved (from relations).
 * applies(): score 0.3 when relations.length > 0 OR any file is
 * added/deleted/renamed.
 */
import type { Arch, ChangeKind, Model } from "@/lib/model/model";
import { register, type AppliesFn, type VizTemplate, type VizContext } from "@/lib/viz/registry";
import GenericBA from "@/components/viz/GenericBA";

export interface GenericBAProps {
  before: Array<{ label: string; kind: ChangeKind; jump?: string }>;
  after: Array<{ label: string; kind: ChangeKind; jump?: string }>;
  moved: Array<{ what: string; to: string; jump?: string }>; // from relations[].edges
}

function isArch(data: unknown): data is Arch {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as Arch).nodes) &&
    Array.isArray((data as Arch).edges)
  );
}

/** Serialize a JumpRef-like structured target into the canonical "file#sym". */
function jumpRefToString(t?: { file: string; sym?: string }): string | undefined {
  if (!t) return undefined;
  return t.sym ? `${t.file}#${t.sym}` : t.file;
}

function build(model: Model): GenericBAProps {
  const before: GenericBAProps["before"] = [];
  const after: GenericBAProps["after"] = [];
  const moved: GenericBAProps["moved"] = [];

  // Files -> before/after columns by lifecycle status.
  for (const f of model.files) {
    const entry = { label: f.path, kind: (f.kinds[0] ?? "modified") as ChangeKind, jump: f.path };
    switch (f.status) {
      case "deleted":
        before.push({ ...entry, kind: "removed" });
        break;
      case "added":
        after.push({ ...entry, kind: "added" });
        break;
      case "renamed":
      case "modified":
      default:
        before.push(entry);
        after.push(entry);
        break;
    }
  }

  // Relations -> a left source chip + right destination chips + moved band.
  for (const rel of model.relations) {
    const srcJump = jumpRefToString(rel.sourceTarget);
    if (rel.source) {
      before.push({ label: rel.source, kind: rel.tagKind, jump: srcJump });
    }
    for (const e of rel.edges) {
      if (e.to) after.push({ label: e.to, kind: rel.tagKind, jump: jumpRefToString(e.target) });
      moved.push({ what: e.what, to: e.to, jump: jumpRefToString(e.target) });
    }
  }

  return { before, after, moved };
}

const applies: AppliesFn<GenericBAProps> = ({ ctx }: { ctx: VizContext }) => {
  const model = ctx.model;
  const hasRelations = model.relations.length > 0;
  const hasLifecycle = model.files.some(
    (f) => f.status === "added" || f.status === "deleted" || f.status === "renamed",
  );
  if (!hasRelations && !hasLifecycle) return { score: 0 };
  return { score: 0.3, props: build(model) };
};

export const T_GENERIC_BA: VizTemplate<GenericBAProps> = {
  id: "arch.generic-ba",
  title: "Generic before/after",
  slot: "arch",
  propsName: "GenericBAProps",
  applies,
  Renderer: GenericBA,
};

register(T_GENERIC_BA);

// Re-export the arch type guard intent for symmetry; not load-bearing.
export { isArch };
