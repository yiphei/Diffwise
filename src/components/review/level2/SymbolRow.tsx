"use client";

/**
 * Level 2 — one symbol row (§7.5.2). Head row (glyph + name + change chip + kind
 * label), the `detail` prose (collapses at level 3), and the nested CodeView
 * (revealed at level 3). Stable DOM id `symbolDomId(path, name)` + data attributes
 * `data-file` / `data-symname` so cross-/deep-links + story spotlights can locate it.
 *
 * Per-symbol collapse (prototype parity): only at level 3, clicking the head toggles
 * a `closed` class that folds just this symbol's CodeView.
 */
import { useState, type KeyboardEvent } from "react";
import type { Symbol } from "@/lib/model/model";
import type { ParsedFile } from "@/lib/model/parsed-diff";
import { symbolDomId } from "@/lib/review/ids";
import { KIND, SYMGLYPH } from "@/lib/review/palette";
import CodeView from "@/components/review/level3/CodeView";
import { Prose } from "@/components/review/Prose";

export interface SymbolRowProps {
  symbol: Symbol;
  parsedFile: ParsedFile;
  filePath: string;
  level: 0 | 1 | 2 | 3 | 4;
  onJump(jump: string): void;
}

export default function SymbolRow({
  symbol,
  parsedFile,
  filePath,
  level,
}: SymbolRowProps): React.ReactElement {
  const [closed, setClosed] = useState(false);
  const change = KIND[symbol.change];
  const glyph = SYMGLYPH[symbol.kind];
  const collapsible = level === 3;

  const toggle = (): void => {
    if (collapsible) setClosed((c) => !c);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!collapsible) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div
      id={symbolDomId(filePath, symbol.name)}
      className={`sym${closed ? " closed" : ""}`}
      data-file={filePath}
      data-symname={symbol.name}
    >
      <div
        className="sym-head"
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        aria-expanded={collapsible ? !closed : undefined}
        onClick={toggle}
        onKeyDown={onKey}
      >
        <span className="sym-glyph" aria-hidden="true">
          {glyph}
        </span>
        <span className="sym-name">
          {symbol.change === "renamed" && symbol.renamedFrom ? (
            <>
              <span className="sym-old">{symbol.renamedFrom}</span> {symbol.name}
            </>
          ) : (
            symbol.name
          )}
        </span>
        <span className="chip" style={{ color: change.c, background: change.bg }}>
          {change.label}
        </span>
        <span className="sym-kind">{symbol.kind}</span>
      </div>

      <Prose as="div" className="sym-detail" text={symbol.detail} />

      <div className="code">
        <CodeView parsedFile={parsedFile} hunkIndices={symbol.hunks} />
      </div>
    </div>
  );
}
