/**
 * Single typed environment accessor. Validation is LAZY (on access), not at import
 * time, so `next build` succeeds with placeholder/missing env (no module throws at
 * load). No other module reads process.env directly (except crypto.ts's key
 * registry, which has its own fail-fast).
 */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export const env = {
  get DATABASE_URL(): string {
    return req("DATABASE_URL");
  },
  get GITHUB_OAUTH_CLIENT_ID(): string {
    return req("GITHUB_OAUTH_CLIENT_ID");
  },
  get GITHUB_OAUTH_CLIENT_SECRET(): string {
    return req("GITHUB_OAUTH_CLIENT_SECRET");
  },
  get GITHUB_OAUTH_CALLBACK_URL(): string {
    return req("GITHUB_OAUTH_CALLBACK_URL");
  },
  get APP_BASE_URL(): string {
    return process.env.APP_BASE_URL ?? "http://localhost:3000";
  },
  get SESSION_COOKIE_SECRET(): string | undefined {
    return process.env.SESSION_COOKIE_SECRET;
  },
  get ANTHROPIC_MODEL(): "claude-opus-4-8" {
    return (process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8") as "claude-opus-4-8";
  },
  get MAX_CHANGED_LINES(): number {
    return num("DIFFWISE_MAX_CHANGED_LINES", 10_000);
  },
  get MAX_CONCURRENT_GENERATIONS(): number {
    return num("MAX_CONCURRENT_GENERATIONS", 4);
  },
  get RATE_LIMIT_GEN_PER_MIN(): number {
    return num("RATE_LIMIT_GEN_PER_MIN", 3);
  },
  get RATE_LIMIT_GEN_PER_HOUR(): number {
    return num("RATE_LIMIT_GEN_PER_HOUR", 30);
  },
  get NODE_ENV(): string {
    return process.env.NODE_ENV ?? "development";
  },
  get isProd(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
