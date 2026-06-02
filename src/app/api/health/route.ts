import { pingDb } from "@/server/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ok = await pingDb();
  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 503,
    headers: { "Content-Type": "application/json" },
  });
}
