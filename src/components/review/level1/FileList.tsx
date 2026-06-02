"use client";

/**
 * Level 1 — file cards (§7.5.1). Maps `model.files[]` to FileCards. Each card
 * resolves its ParsedFile via `parsed.byPath[file.path]` (the validator guarantees
 * this resolves, §6.6 rule 3); we still skip-on-miss defensively during streaming.
 */
import type { ModelFile } from "@/lib/model/model";
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import FileCard from "./FileCard";

export interface FileListProps {
  files: ModelFile[];
  parsed: ParsedDiff | null;
  level: 0 | 1 | 2 | 3 | 4;
  onJump(jump: string): void;
}

export default function FileList({
  files,
  parsed,
  level,
  onJump,
}: FileListProps): React.ReactElement {
  if (!files || files.length === 0) {
    return <div className="files-empty">Analyzing files…</div>;
  }
  return (
    <div className="file-list">
      {files.map((file) => {
        const parsedFile = parsed?.byPath[file.path];
        if (!parsedFile) return null; // skip-on-miss while streaming
        return (
          <FileCard
            key={file.path}
            file={file}
            parsedFile={parsedFile}
            level={level}
            onJump={onJump}
          />
        );
      })}
    </div>
  );
}
