"use client";

/**
 * Level 2 — symbols within a file (§7.5.2). Maps `file.symbols[]` to SymbolRows.
 * Revealed (via CSS `.symbols` reveal) at level ≥2; nested inside its FileCard.
 */
import type { Symbol } from "@/lib/model/model";
import type { ParsedFile } from "@/lib/model/parsed-diff";
import SymbolRow from "./SymbolRow";

export interface SymbolListProps {
  symbols: Symbol[];
  parsedFile: ParsedFile;
  filePath: string;
  level: 0 | 1 | 2 | 3 | 4;
  onJump(jump: string): void;
}

export default function SymbolList({
  symbols,
  parsedFile,
  filePath,
  level,
  onJump,
}: SymbolListProps): React.ReactElement {
  if (!symbols || symbols.length === 0) {
    return <div className="symbols-empty">no symbol-level changes</div>;
  }
  return (
    <div className="symbols">
      {symbols.map((s) => (
        <SymbolRow
          key={s.name}
          symbol={s}
          parsedFile={parsedFile}
          filePath={filePath}
          level={level}
          onJump={onJump}
        />
      ))}
    </div>
  );
}
