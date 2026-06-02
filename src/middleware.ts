/**
 * Root Next.js middleware (§10.4 CSP + §3.8 page-navigation gate).
 *
 * 1. CSP nonce: a fresh base64(randomBytes(16)) nonce per request is woven into the
 *    Content-Security-Policy (script-src/style-src 'nonce-{n}') and forwarded to the
 *    app via the `x-nonce` request header so Next can attach it to inline bootstrap
 *    scripts. The full §10.4 policy + hardening headers are set on every response.
 * 2. Page gate: non-public page navigations without a `dw_session` cookie are
 *    redirected to '/'. This is a CHEAP PRESENCE CHECK ONLY — authoritative
 *    validation happens server-side via requireUser/resolveSession. API routes are
 *    NOT redirected here (they return 401 JSON via requireUser).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "dw_session";

/** Paths reachable without a session (everything else page nav -> redirect to '/'). */
const PUBLIC_PATHS = new Set<string>([
  "/",
  "/api/auth/github/login",
  "/api/auth/github/callback",
  "/api/health",
]);

/** Build the per-request CSP with the nonce threaded into script/style-src (§10.4). */
function buildCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types diffwise-sanitizer dompurify",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Additional hardening headers (§10.4). */
function applySecurityHeaders(headers: Headers, csp: string): void {
  headers.set("Content-Security-Policy", csp);
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Next internals + static assets are always allowed (also excluded by matcher).
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Per-request CSP nonce: base64 of 16 random bytes.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = buildCsp(nonce);

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");

  // Gate PAGE navigations only (not API routes — those return 401 JSON via requireUser).
  if (!isApi && !isPublic(pathname) && !hasSession) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    const res = NextResponse.redirect(redirectUrl);
    applySecurityHeaders(res.headers, csp);
    return res;
  }

  // Forward the nonce to the app via a request header so layouts can read it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(res.headers, csp);
  return res;
}

/** Run on everything except Next internals / static assets / favicon (§3.8). */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
