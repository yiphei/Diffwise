"use client";

/**
 * Level 1 — one file card (§7.5.1). Status badge (`palette.BADGE[file.status]`),
 * the path (monospace), kind chips, a per-file ministat bar from
 * `parsedFile.additions/deletions`, and the summary (collapses at level 3).
 * Stable DOM id `fileDomId(file.path)` for deep-/cross-link targeting. Nested
 * inside: <SymbolList> (revealed at level ≥2).
 */
import type { ModelFile } from "@/lib/model/model";
import type { ParsedFile } from "@/lib/model/parsed-diff";
import { fileDomId } from "@/lib/review/ids";
import { BADGE, KIND } from "@/lib/review/palette";
import SymbolList from "@/components/review/level2/SymbolList";
import { Prose } from "@/components/review/Prose";

export interface FileCardProps {
  file: ModelFile;
  parsedFile: ParsedFile;
  level: 0 | 1 | 2 | 3 | 4;
  onJump(jump: string): void;
}

/** Render the add/del ministat bar (proportional segments). */
function Ministat({ add, del }: { add: number; del: number }): React.ReactElement {
  const total = add + del;
  const addPct = total > 0 ? (add / total) * 100 : 0;
  const delPct = total > 0 ? (del / total) * 100 : 0;
  return (
    <span className="ministat" title={`+${add} −${del}`}>
      <span className="ms-bar">
        <span className="ms-add" style={{ width: `${addPct}%` }} />
        <span className="ms-del" style={{ width: `${delPct}%` }} />
      </span>
      <span className="ms-num ms-add-num">+{add}</span>
      <span className="ms-num ms-del-num">−{del}</span>
    </span>
  );
}

export default function FileCard({
  file,
  parsedFile,
  level,
  onJump,
}: FileCardProps): React.ReactElement {
  const badge = BADGE[file.status];
  return (
    <section id={fileDomId(file.path)} className="file-card">
      <div className="file-head">
        <span className="badge" style={{ color: badge.c, background: badge.bg }}>
          {badge.label}
        </span>
        <span className="file-path">{file.path}</span>
        <Ministat add={parsedFile.additions} del={parsedFile.deletions} />
      </div>

      {file.kinds.length > 0 && (
        <div className="kinds">
          {file.kinds.map((k) => {
            const s = KIND[k];
            return (
              <span key={k} className="chip" style={{ color: s.c, background: s.bg }}>
                {s.label}
              </span>
            );
          })}
        </div>
      )}

      <Prose as="div" className="summary" text={file.summary} />

      <SymbolList
        symbols={file.symbols}
        parsedFile={parsedFile}
        filePath={file.path}
        level={level}
        onJump={onJump}
      />
    </section>
  );
}
