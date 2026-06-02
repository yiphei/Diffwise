"use client";

/**
 * Level 3 — Code (§7.5.3). Renders a TEXT-ONLY line-diff table for one symbol from
 * the ParsedDiff (never from the LLM). Ports the prototype's `hunkTable` + word diff.
 *
 * SECURITY (LOCKED): the diff is untrusted. `Line.c` and `Hunk.header` are inserted
 * as React text children ONLY — NEVER `dangerouslySetInnerHTML`. The word-diff spans
 * wrap escaped token text (structured spans from `word-diff.ts`), so the renderer
 * builds `<span>` elements with text children — no raw-HTML path exists here.
 */
import { Fragment, type ReactNode } from "react";
import type { ParsedFile, Line } from "@/lib/model/parsed-diff";
import { wordDiff, type WordSpan } from "@/lib/model/word-diff";

export interface CodeViewProps {
  parsedFile: ParsedFile;
  /** = symbol.hunks; each index validated 0..hunks.length-1 (§6.6 rule 5). */
  hunkIndices: number[];
}

/** Marker glyph for the code column: + / − / space. */
function marker(t: Line["t"]): string {
  if (t === "add") return "+";
  if (t === "del") return "−";
  return " ";
}

/** Build <span> children from structured word-diff spans (text children only). */
function spans(parts: WordSpan[], changedClass: "wd-del" | "wd-add"): ReactNode {
  return parts.map((p, i) => (
    <span key={i} className={p.changed ? changedClass : "wd-eq"}>
      {p.text}
    </span>
  ));
}

interface RenderLine {
  line: Line;
  /** Word-diff content for the code body, or null to render plain text. */
  pw: boolean;
  content: ReactNode;
}

/**
 * Walk a hunk's lines, pairing equal-length runs of consecutive `del` lines
 * immediately followed by the same count of `add` lines into word-diffed rows.
 */
function buildRows(lines: Line[]): RenderLine[] {
  const out: RenderLine[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.t === "del") {
      // Collect the run of consecutive dels.
      let j = i;
      while (j < lines.length && lines[j]!.t === "del") j++;
      const dels = lines.slice(i, j);
      // Collect the immediately-following run of consecutive adds.
      let k = j;
      while (k < lines.length && lines[k]!.t === "add") k++;
      const adds = lines.slice(j, k);

      if (adds.length > 0 && adds.length === dels.length) {
        // Equal-length paired run → intra-line word diff per pair.
        for (let p = 0; p < dels.length; p++) {
          const wd = wordDiff(dels[p]!.c, adds[p]!.c);
          out.push({ line: dels[p]!, pw: true, content: spans(wd.del, "wd-del") });
        }
        for (let p = 0; p < adds.length; p++) {
          const wd = wordDiff(dels[p]!.c, adds[p]!.c);
          out.push({ line: adds[p]!, pw: true, content: spans(wd.add, "wd-add") });
        }
        i = k;
        continue;
      }

      // Unpaired dels → plain.
      for (const d of dels) out.push({ line: d, pw: false, content: d.c });
      i = j;
      continue;
    }

    // ctx or unpaired add → plain text.
    out.push({ line, pw: false, content: line.c });
    i++;
  }
  return out;
}

export default function CodeView({ parsedFile, hunkIndices }: CodeViewProps): React.ReactElement {
  const valid = hunkIndices.filter((idx) => idx >= 0 && idx < parsedFile.hunks.length);

  if (valid.length === 0) {
    return <div className="code-empty">no diff lines</div>;
  }

  return (
    <table className="difftab">
      <tbody>
        {valid.map((idx) => {
          const hunk = parsedFile.hunks[idx]!;
          const rows = buildRows(hunk.lines);
          return (
            <Fragment key={idx}>
              <tr className="hunk-hd">
                <td className="ln" />
                <td className="ln" />
                {/* Hunk header rendered as TEXT (never HTML). */}
                <td className="code">{hunk.header}</td>
              </tr>
              {rows.map((r, ri) => (
                <tr key={ri} className={`${r.line.t}${r.pw ? " pw" : ""}`}>
                  <td className="ln">{r.line.o ?? ""}</td>
                  <td className="ln">{r.line.n ?? ""}</td>
                  <td className="code">
                    <span className="mk">{marker(r.line.t)}</span>
                    {r.content}
                  </td>
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
