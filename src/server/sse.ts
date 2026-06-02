/**
 * SSE wire encoding + response factory (§2.6 / §2.5).
 *
 * The event union is owned by §2.6 (`SseEvent` in `@/lib/model/model`). This
 * module is the SINGLE place that renders those events to bytes and the SINGLE
 * place that builds the streaming `Response`. It never invents event names.
 *
 * Frame format (standard SSE): a line `event: <name>`, a line `data: <single-line
 * JSON>`, terminated by a blank line.
 */
import { toDiffwiseError } from "@/lib/model/errors";
import type { SseEvent } from "@/lib/model/model";
import { logger } from "@/lib/log";

const encoder = new TextEncoder();

/** Keep-alive cadence (§2.6 "~15s"). */
const HEARTBEAT_MS = 15_000;

/** Encode one SSE event into a `event:`/`data:` frame as UTF-8 bytes. */
export function encodeEvent(e: SseEvent): Uint8Array {
  // data MUST be single-line JSON (no embedded newlines). JSON.stringify never
  // emits raw newlines, so the payload is inherently one line.
  const frame = `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
  return encoder.encode(frame);
}

/** Headers for a long-lived SSE stream (§2.5). */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-store",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * Build a streaming SSE `Response`. The `handler` receives an `emit` function
 * (each call enqueues an encoded event) and the request `signal`. The stream:
 *
 * - sends a `heartbeat` every ~15s,
 * - closes on handler completion,
 * - on a thrown error, emits an `error` event (mapped via `toDiffwiseError`)
 *   then closes,
 * - stops the heartbeat when the signal aborts (client disconnect).
 */
export function createSseResponse(
  handler: (emit: (e: SseEvent) => void, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): Response {
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (bytes: Uint8Array): void => {
        if (closed) return;
        try {
          controller.enqueue(bytes);
        } catch {
          // Controller already closed/errored (e.g. client gone). Ignore.
          closed = true;
        }
      };

      const emit = (e: SseEvent): void => {
        safeEnqueue(encodeEvent(e));
      };

      const stopHeartbeat = (): void => {
        if (heartbeat !== null) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };

      const finish = (): void => {
        if (closed) return;
        closed = true;
        stopHeartbeat();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const onAbort = (): void => {
        // Client disconnected: stop the heartbeat. The handler observes the same
        // signal and unwinds its in-flight work; we then close the stream.
        stopHeartbeat();
      };
      signal.addEventListener("abort", onAbort, { once: true });

      heartbeat = setInterval(() => {
        emit({ event: "heartbeat", data: { t: Date.now() } });
      }, HEARTBEAT_MS);

      try {
        await handler(emit, signal);
      } catch (err) {
        const de = toDiffwiseError(err);
        logger.error("sse.handler.error", { code: de.code, cause: de.message });
        emit({
          event: "error",
          data: { code: de.code, message: de.userMessage },
        });
      } finally {
        signal.removeEventListener("abort", onAbort);
        finish();
      }
    },
    cancel() {
      // Reader was cancelled (client closed the tab / aborted fetch).
      closed = true;
      if (heartbeat !== null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
