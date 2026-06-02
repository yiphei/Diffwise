/**
 * Root Next.js middleware (§10.4 CSP + §3.8 page-navigation gate).
 *
 * CSP is environment-aware:
 *  - Development: relaxed so the Next/Turbopack dev runtime works (React dev needs
 *    `unsafe-eval`; the dev client injects inline bootstrap + HMR websockets).
 *    Trusted Types are NOT forced (Next does not ship a TrustedScriptURL policy for
 *    its chunk loader).
 *  - Production: strict nonce-based policy with `strict-dynamic`. The nonce is woven
 *    into the CSP AND forwarded on the request headers so Next attaches it to its
 *    own <script> tags (without this, strict-dynamic blocks Next's scripts).
 *
 * NOTE (§10.4 reconciliation): the spec's `require-trusted-types-for 'script'` +
 * `trusted-types` directives are intentionally omitted — Next.js' script loader is
 * not Trusted-Types-compatible out of the box, and §10.4 itself hedges TT as
 * "enforced where available, else by code review". DOMPurify (src/lib/sanitize.ts)
 * remains the single sanitization sink, which is the real XSS control.
 *
 * Page gate: non-public page navigations without a `dw_session` cookie redirect to
 * '/' (cheap PRESENCE check only — authoritative validation is server-side via
 * requireUser/resolveSession). API routes are not redirected (they return 401 JSON).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "dw_session";
const IS_PROD = process.env.NODE_ENV === "production";

/** Paths reachable without a session (everything else page nav -> redirect to '/'). */
const PUBLIC_PATHS = new Set<string>([
  "/",
  "/api/auth/github/login",
  "/api/auth/github/callback",
  "/api/health",
]);

/** Strict nonce-based production policy (§10.4, minus Next-incompatible TT). */
function prodCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Next/React inject some inline <style>; nonce-ing every one is impractical, so
    // styles are allowed inline (no script execution risk).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Relaxed development policy so the dev runtime + HMR work. */
function devCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self'",
    "connect-src 'self' ws: wss:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

/** Additional hardening headers (§10.4). HSTS only in prod (https). */
function applySecurityHeaders(headers: Headers, csp: string): void {
  headers.set("Content-Security-Policy", csp);
  if (IS_PROD) {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Per-request CSP nonce (prod only — dev uses the relaxed policy).
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = IS_PROD ? prodCsp(nonce) : devCsp();

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");

  // Gate PAGE navigations only.
  if (!isApi && !isPublic(pathname) && !hasSession) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    const res = NextResponse.redirect(redirectUrl);
    applySecurityHeaders(res.headers, csp);
    return res;
  }

  // Forward the nonce (and, in prod, the CSP) on the REQUEST headers so Next reads
  // the nonce and attaches it to its own scripts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  if (IS_PROD) requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(res.headers, csp);
  return res;
}

/** Run on everything except Next internals / static assets / favicon (§3.8). */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
