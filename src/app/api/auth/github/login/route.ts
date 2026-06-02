import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/server/auth/githubOauth";
import { env } from "@/server/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generate CSRF `state`, set the short-lived oauth_state cookie, redirect to GitHub. */
export async function GET(): Promise<Response> {
  const state = randomBytes(32).toString("base64url");
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
