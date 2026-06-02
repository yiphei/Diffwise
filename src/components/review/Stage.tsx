"use client";

/**
 * The scrollable stage (§7.2). SINGLE render: all five level slots mount into the
 * DOM once; the current level is applied as `data-level` on the wrapper and CSS
 * `max-height`/`opacity` transitions collapse/expand the slots (prototype parity).
 * This keeps every element addressable for deep-links + scroll targets at all
 * levels and makes transitions pure CSS.
 *
 * Files/symbols/code are physically nested (symbols inside their file card, code
 * inside their symbol row), so the same DOM serves levels 1–3 with progressive
 * reveal. Level 4 mounts <ArchView/> (§9 registry host).
 */
import { useReviewStore } from "@/components/review/state/useReviewStore";
import IntentPanel from "@/components/review/level0/IntentPanel";
import FileList from "@/components/review/level1/FileList";
import ArchView from "@/components/review/level4/ArchView";

export default function Stage(): React.ReactElement {
  const level = useReviewStore((s) => s.level);
  const parsed = useReviewStore((s) => s.parsed);
  const model = useReviewStore((s) => s.model);
  const jumpTo = useReviewStore((s) => s.jumpTo);

  return (
    <main className="stage" data-level={level}>
      <section className="slot slot-intent" data-slot="0">
        <IntentPanel
          meta={model?.meta}
          stats={model?.stats}
          themes={model?.themes}
          relations={model?.relations}
          onJump={jumpTo}
        />
      </section>

      {/* Levels 1–3 share one nested DOM tree (files → symbols → code). */}
      <section className="slot slot-files" data-slot="1">
        <FileList files={model?.files ?? []} parsed={parsed} level={level} onJump={jumpTo} />
      </section>

      <section className="slot slot-arch" data-slot="4">
        {model?.arch ? (
          <ArchView arch={model.arch} onJump={jumpTo} />
        ) : (
          <div className="arch-empty">Wiring diagram will appear here.</div>
        )}
      </section>
    </main>
  );
}
