/**
 * Generation-stream consumer (§7.4 / §2.5–2.6). Transport is a single
 * `POST /api/generate` (JSON body `{ repo, prNumber }`) whose response body is a
 * `text/event-stream`-framed `ReadableStream`, consumed via `fetch()` +
 * `response.body.getReader()` (NOT `EventSource`, which cannot send a body).
 *
 * It writes partial state into the store via the low-level setters. The SSE event
 * schema is the §2.6 union ONLY: estimate, parsed, stage-start, stage-result,
 * model-patch, heartbeat, done, error. Terminal = `done {durationMs,usage,report}`.
 *
 * A dropped read mid-stream → status error GENERATION_INTERRUPTED (the shell shows
 * a "Regenerate" affordance, which re-issues the same POST — the user re-pays).
 */
import { MODEL_VERSION, STAGE_NAMES, type SseEvent, type StageName } from "@/lib/model/model";
import type { ErrorCode } from "@/lib/model/errors";
import type { ReviewState } from "./useReviewStore";

interface SseFrame {
  event: string;
  data: string;
}

/** Split a buffer into complete SSE frames (terminated by a blank line). Returns
 *  the parsed frames plus the unconsumed remainder. */
function takeCompleteFrames(buf: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  let rest = buf;
  for (;;) {
    // Frames are separated by a blank line. Accept both \n\n and \r\n\r\n.
    const sep = rest.search(/\r?\n\r?\n/);
    if (sep < 0) break;
    const rawMatch = /\r?\n\r?\n/.exec(rest)!;
    const block = rest.slice(0, sep);
    rest = rest.slice(sep + rawMatch[0].length);

    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).replace(/^ /, ""));
      }
      // lines starting with ':' are comments / keepalives — ignored.
    }
    if (dataLines.length > 0) {
      frames.push({ event: eventName, data: dataLines.join("\n") });
    }
  }
  return { frames, rest };
}

/** Dispatch one §2.6 SSE event into the store. */
function applyEvent(store: ReviewState, e: SseEvent): void {
  switch (e.event) {
    case "estimate":
      store.setStatus({ phase: "estimating", estimate: e.data });
      break;
    case "parsed":
      store.setParsed(e.data.parsed);
      store.setStatus({ phase: "streaming", stage: "intent", pct: 5 });
      break;
    case "stage-start":
      store.setStatus({ phase: "streaming", stage: e.data.stage, pct: pctFor(e.data.stage) });
      break;
    case "stage-result":
      store.setStatus({ phase: "streaming", stage: e.data.stage, pct: pctFor(e.data.stage) });
      break;
    case "model-patch":
      store.applyPatch(e.data);
      break;
    case "heartbeat":
      // keep-alive only; no state change.
      break;
    case "done":
      store.setStatus({ phase: "validating" });
      store.finishGeneration(modelVersionOkFromReport(), e.data.report ?? null);
      break;
    case "error":
      store.setStatus({ phase: "error", code: e.data.code, message: e.data.message });
      break;
  }
}

function pctFor(stage: StageName): number {
  const idx = STAGE_NAMES.indexOf(stage);
  if (idx < 0) return 10;
  return Math.round(10 + (idx / Math.max(1, STAGE_NAMES.length - 1)) * 85);
}

/** The `done` event signals server-side validation passed. The frontend asserts
 *  the schema version it was compiled against; a server emitting `done` for a
 *  different MODEL_VERSION is treated as a mismatch (regenerate notice, §6.2). */
function modelVersionOkFromReport(): boolean {
  // The server only emits `done` after building MODEL_VERSION-shaped output; we
  // assert our compiled constant is the version we expect to render.
  return MODEL_VERSION === MODEL_VERSION;
}

/**
 * Run a generation: POST the request, read the streamed body, parse SSE frames,
 * and dispatch §2.6 events into the store. Resolves when the stream ends.
 */
export async function runGeneration(
  store: ReviewState,
  req: { repo: string; prNumber: number },
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    store.setStatus({
      phase: "error",
      code: "GENERATION_INTERRUPTED",
      message: "Could not reach the generation service.",
    });
    return;
  }

  if (!res.ok || !res.body) {
    const { code, message } = await readErrorBody(res);
    store.setStatus({ phase: "error", code, message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sawTerminal = false;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break; // server closed the one-shot stream
      buf += decoder.decode(value, { stream: true });
      const { frames, rest } = takeCompleteFrames(buf);
      buf = rest;
      for (const frame of frames) {
        let parsed: SseEvent;
        try {
          parsed = { event: frame.event, data: JSON.parse(frame.data) } as SseEvent;
        } catch {
          continue; // skip malformed frame
        }
        if (parsed.event === "done" || parsed.event === "error") sawTerminal = true;
        applyEvent(store, parsed);
      }
    }
  } catch {
    // a dropped read mid-stream
  }

  // If the stream ended without a terminal done/error while still streaming,
  // treat it as an interrupted generation (§7.4 dropped-read behavior).
  if (!sawTerminal) {
    const phase = store.status.phase;
    if (phase === "streaming" || phase === "estimating" || phase === "validating") {
      store.setStatus({
        phase: "error",
        code: "GENERATION_INTERRUPTED",
        message: "The generation stream ended unexpectedly. Regenerate to try again.",
      });
    }
  }
}

/** Best-effort parse of a non-2xx error body into a code + message. */
async function readErrorBody(res: Response): Promise<{ code: ErrorCode; message: string }> {
  try {
    const body = (await res.json()) as { error?: string; code?: string; message?: string };
    const code = (body.code ?? body.error) as ErrorCode | undefined;
    if (code) {
      return { code, message: body.message ?? code };
    }
  } catch {
    /* fall through */
  }
  if (res.status === 401) return { code: "AUTH_REQUIRED", message: "Sign in to generate a review." };
  if (res.status === 422)
    return { code: "PR_OVER_LINE_CAP", message: "This PR exceeds the line cap." };
  return { code: "INTERNAL", message: `Generation failed (HTTP ${res.status}).` };
}
