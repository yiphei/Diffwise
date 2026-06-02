import { NextResponse } from "next/server";
import { buildClearSessionCookie, destroySession, readCookie } from "@/server/auth/session";

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
  res.headers.append("Set-Cookie", buildClearSessionCookie());
  return res;
}
