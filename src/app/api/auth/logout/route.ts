import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  destroySession,
  readCookie,
  sessionCookieOptions,
} from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const raw = readCookie(req, "dw_session");
  if (raw) {
    try {
      await destroySession(raw);
    } catch {
      // best-effort
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
