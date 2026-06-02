/**
 * Single logging chokepoint with secret scrubbing (§10.5). Never logs decrypted
 * tokens/keys, Authorization/x-api-key headers, the master key, ciphertext, or raw
 * diff/MODEL content. Key-shaped substrings are redacted anywhere they appear
 * (defense-in-depth). Routes that carry credentials log only {route,userId,status}.
 */
const KEY_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]+/g, // Anthropic
  /gh[opusr]_[A-Za-z0-9]+/g, // GitHub gho_/ghp_/ghu_/ghs_/ghr_
  /github_pat_[A-Za-z0-9_]+/g, // fine-grained PAT
];

const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "access_token",
  "accesstoken",
  "authorization",
  "x-api-key",
  "ciphertext",
  "authtag",
  "auth_tag",
  "iv",
  "password",
  "secret",
  "client_secret",
  "token",
]);

export function scrub(s: string): string {
  return KEY_PATTERNS.reduce((acc, re) => acc.replace(re, "***REDACTED***"), s);
}

/** Recursively scrub an arbitrary payload before emission. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "***REDACTED***" : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: "info" | "warn" | "error", message: string, meta?: unknown): void {
  const line = {
    level,
    msg: scrub(message),
    ...(meta !== undefined ? { meta: scrubValue(meta) } : {}),
    t: new Date().toISOString(),
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const logger = {
  info: (message: string, meta?: unknown) => emit("info", message, meta),
  warn: (message: string, meta?: unknown) => emit("warn", message, meta),
  error: (message: string, meta?: unknown) => emit("error", message, meta),
};

/** Marker used in place of any credential-route request body in logs. */
export const REDACTED_CREDENTIAL_BODY = "[REDACTED_CREDENTIAL_BODY]";
