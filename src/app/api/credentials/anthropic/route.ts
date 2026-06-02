import { DiffwiseError } from "@/lib/model/errors";
import { encrypt } from "@/server/crypto";
import { credentialStore } from "@/server/credentials/store";
import { json, jsonError, requireUserOrThrow } from "@/server/http";
import { anthropicTestCall } from "@/server/pipeline/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — non-secret status of the BYOK key (§3.7). */
export async function GET(req: Request): Promise<Response> {
  try {
    const user = await requireUserOrThrow(req);
    const row = await credentialStore.get(user.id, "anthropic_byok");
    return json({
      present: !!row,
      last4: row?.last4 ?? null,
      status: row?.status ?? null,
      validatedAt: row?.validatedAt ?? null,
    });
  } catch (e) {
    return jsonError(e);
  }
}

/** PUT — validate-on-entry, then encrypt + upsert (§3.7). Body NOT logged (§10.5). */
export async function PUT(req: Request): Promise<Response> {
  try {
    const user = await requireUserOrThrow(req);
    const body = (await req.json().catch(() => ({}))) as { apiKey?: unknown };
    const apiKey = body.apiKey;
    if (typeof apiKey !== "string" || apiKey.length < 8) {
      throw new DiffwiseError("INVALID_BYOK_KEY", { message: "That doesn't look like an Anthropic API key." });
    }
    const ok = await anthropicTestCall(apiKey);
    if (!ok) throw new DiffwiseError("INVALID_BYOK_KEY");
    const envelope = encrypt(apiKey, user.id);
    await credentialStore.upsert(user.id, "anthropic_byok", envelope, apiKey.slice(-4));
    return json({ present: true, last4: apiKey.slice(-4), status: "active" });
  } catch (e) {
    return jsonError(e);
  }
}

/** DELETE — revoke (remove the row). */
export async function DELETE(req: Request): Promise<Response> {
  try {
    const user = await requireUserOrThrow(req);
    await credentialStore.delete(user.id, "anthropic_byok");
    return json({ present: false });
  } catch (e) {
    return jsonError(e);
  }
}
