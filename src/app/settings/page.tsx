"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface KeyStatus {
  present: boolean;
  last4: string | null;
  status: string | null;
  validatedAt?: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch("/api/credentials/anthropic");
    if (r.ok) setStatus(await r.json());
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/credentials/anthropic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg(d.message ?? "Could not save key.");
      } else {
        setApiKey("");
        setMsg("Key saved and validated.");
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await fetch("/api/credentials/anthropic", { method: "DELETE" });
    setBusy(false);
    await refresh();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  const hasKey = status?.present && status.status === "active";

  return (
    <main style={S.main}>
      <a href="/" style={S.link}>
        ← Home
      </a>
      <h1 style={S.h1}>Settings</h1>

      <section style={S.card}>
        <h2 style={S.h2}>GitHub</h2>
        <p style={S.p}>Signed in with GitHub. Diffwise reads repositories you grant access to.</p>
        <button onClick={signOut} style={S.secondaryBtn} disabled={busy}>
          Sign out
        </button>
      </section>

      <section style={S.card}>
        <h2 style={S.h2}>Anthropic API key (BYOK)</h2>
        {hasKey ? (
          <p style={S.p}>
            Key on file: <code>••••••••{status?.last4}</code> ({status?.status}). Your key is
            encrypted at rest and never sent back to the browser.
          </p>
        ) : (
          <p style={S.p}>No key on file. Add one to generate reviews.</p>
        )}
        <form onSubmit={save} style={S.form}>
          <input
            style={S.input}
            type="password"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <div style={S.row}>
            <button type="submit" style={S.primaryBtn} disabled={busy || apiKey.length < 8}>
              {hasKey ? "Replace key" : "Save key"}
            </button>
            {hasKey && (
              <button type="button" onClick={remove} style={S.dangerBtn} disabled={busy}>
                Remove
              </button>
            )}
          </div>
        </form>
        {msg && <p style={S.msg}>{msg}</p>}
      </section>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  main: { maxWidth: 640, margin: "0 auto", padding: "6vh 24px", fontFamily: "system-ui, sans-serif" },
  h1: { fontSize: 32, margin: "12px 0 24px" },
  h2: { fontSize: 18, margin: "0 0 8px" },
  p: { fontSize: 14, lineHeight: 1.5, opacity: 0.85, margin: "0 0 12px" },
  card: { padding: 20, borderRadius: 12, border: "1px solid #8883", marginBottom: 20 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  row: { display: "flex", gap: 12 },
  input: { padding: "10px 12px", fontSize: 15, borderRadius: 8, border: "1px solid #8884", background: "transparent", color: "inherit", fontFamily: "monospace" },
  primaryBtn: { padding: "10px 16px", fontSize: 15, fontWeight: 600, borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer" },
  secondaryBtn: { padding: "8px 14px", fontSize: 14, borderRadius: 8, border: "1px solid #8884", background: "transparent", color: "inherit", cursor: "pointer" },
  dangerBtn: { padding: "10px 16px", fontSize: 15, borderRadius: 8, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" },
  msg: { fontSize: 13, marginTop: 10, opacity: 0.9 },
  link: { color: "#3b82f6", fontSize: 14, textDecoration: "none" },
};
