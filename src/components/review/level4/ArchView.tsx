"use client";

/**
 * ArchView — host for the level-4 architecture view (§7.5.4 + §9).
 *
 * STATIC in v1 (LOCKED): no morph/scrubber/play. ArchView delegates the actual
 * rendering to the visualization registry (§9): it builds a VizContext and calls
 * selectTemplate('arch', arch, ctx). The registry picks:
 *   T_ARCH_STATIC (score 1, nodes>0) -> GenericBA (0.3) -> MetricCompare (0.2)
 *   -> relations+prose fallback (floor).
 * So the architecture section is NEVER blank — graceful degradation to
 * relations + AI prose when arch.nodes is empty/invalid.
 *
 * Pinned interface is `<ArchView arch onJump/>`. The remaining context fields
 * (model/parsed/level/theme/reducedMotion) are OPTIONAL: when the shell supplies
 * them the full fallback chain (which reads model.relations / model.files /
 * model.meta.summary) works; when omitted, ArchView synthesizes a minimal model
 * from `arch` alone so selectTemplate still resolves a usable template.
 */
import { useMemo } from "react";
import type { Arch, Model } from "@/lib/model/model";
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import { selectTemplate, type VizContext } from "@/lib/viz/registry";
import "@/lib/viz/templates"; // registration side effects (arch slot chain)

export interface ArchViewProps {
  arch: Arch;
  onJump: (jump: string) => void;
  /** Optional full context — supplied by the shell for the fallback chain. */
  model?: Model;
  parsed?: ParsedDiff;
  level?: 0 | 1 | 2 | 3 | 4;
  theme?: "light" | "dark";
  reducedMotion?: boolean;
}

/** Build a minimal MODEL carrying just the arch so the registry can still run
 *  when the shell did not pass a full model (defensive — never a blank). */
function minimalModel(arch: Arch): Model {
  return {
    modelVersion: 1,
    meta: { title: "", summary: "" },
    stats: { filesChanged: 0, additions: 0, deletions: 0, perFile: [] },
    themes: [],
    relations: [],
    files: [],
    arch,
    story: [],
  };
}

const EMPTY_PARSED: ParsedDiff = { files: [], byPath: {} };

export default function ArchView({
  arch,
  onJump,
  model,
  parsed,
  level = 4,
  theme = "light",
  reducedMotion = false,
}: ArchViewProps) {
  const ctx: VizContext = useMemo(
    () => ({
      model: model ?? minimalModel(arch),
      parsed: parsed ?? EMPTY_PARSED,
      jump: onJump,
      level,
      theme,
      reducedMotion,
    }),
    [model, parsed, arch, onJump, level, theme, reducedMotion],
  );

  const { template, props } = useMemo(
    () => selectTemplate("arch", ctx.model.arch, ctx),
    [ctx],
  );

  const Renderer = template.Renderer;

  return (
    <div className="arch-view" data-template={template.id}>
      <Renderer {...(props as object)} ctx={ctx} />
    </div>
  );
}
