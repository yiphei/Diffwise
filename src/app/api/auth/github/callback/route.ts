import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/log";
import { env } from "@/server/config/env";
import { exchangeCodeForToken, fetchGithubUser } from "@/server/auth/githubOauth";
import {
  SESSION_COOKIE,
  createSession,
  readCookie,
  sessionCookieOptions,
} from "@/server/auth/session";
import { encrypt } from "@/server/crypto";
import { credentialStore } from "@/server/credentials/store";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
}

async function upsertUser(gh: GithubUser): Promise<string> {
  const existing = await db.select().from(users).where(eq(users.githubUserId, gh.id)).limit(1);
  const now = new Date();
  if (existing[0]) {
    await db
      .update(users)
      .set({
        githubLogin: gh.login,
        name: gh.name,
        avatarUrl: gh.avatar_url,
        email: gh.email,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, existing[0].id));
    return existing[0].id;
  }
  const inserted = await db
    .insert(users)
    .values({
      githubUserId: gh.id,
      githubLogin: gh.login,
      name: gh.name,
      avatarUrl: gh.avatar_url,
      email: gh.email,
      lastLoginAt: now,
    })
    .returning({ id: users.id });
  return inserted[0]!.id;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = readCookie(req, "oauth_state");

  if (!code || !state || !cookieState || cookieState !== state) {
    const res = NextResponse.redirect(new URL("/?error=oauth_state", env.APP_BASE_URL));
    res.cookies.delete("oauth_state");
    return res;
  }

  try {
    const token = await exchangeCodeForToken(code);
    const gh = await fetchGithubUser(token.access_token);
    const userId = await upsertUser(gh);
    const envelope = encrypt(token.access_token, userId);
    await credentialStore.upsert(userId, "github_oauth", envelope, token.access_token.slice(-4));
    const raw = await createSession(userId, req);

    const res = NextResponse.redirect(new URL("/", env.APP_BASE_URL));
    // Both cookies via the SAME (cookies API) path — mixing with a raw
    // headers.append('Set-Cookie', ...) drops the manually-appended one.
    res.cookies.set(SESSION_COOKIE, raw, sessionCookieOptions());
    res.cookies.delete("oauth_state");
    return res;
  } catch (e) {
    logger.error("github oauth callback failed", e);
    const res = NextResponse.redirect(new URL("/?error=oauth", env.APP_BASE_URL));
    res.cookies.delete("oauth_state");
    return res;
  }
}
