"use client";

/**
 * The ONE allowed sanitized-HTML sink (§7.5, §10.2 Rule 2). Renders LLM-authored
 * prose via `sanitizeProse` (inline-markdown → DOMPurify tight allowlist) and
 * injects it with `dangerouslySetInnerHTML`. NO other component may use a raw-HTML
 * sink — diff content is rendered as text (CodeView).
 *
 * Named export, reused by E2 (story / arch captions).
 */
import { type ElementType, useMemo } from "react";
import { sanitizeProse } from "@/lib/sanitize";

export interface ProseProps {
  text: string | null | undefined;
  /** Element to render as (default span; intent summary uses 'p'). */
  as?: ElementType;
  className?: string;
}

export function Prose({ text, as: Tag = "span", className }: ProseProps): React.ReactElement {
  const html = useMemo(() => sanitizeProse(text), [text]);
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default Prose;
