"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface KeyStatus {
  present: boolean;
  last4: string | null;
  status: string | null;
}

export function LandingClient({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [pr, setPr] = useState("");
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/credentials/anthropic")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setKeyStatus(d))
      .catch(() => {});
  }, [signedIn]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const repoTrim = repo.trim();
    const prNum = Number(pr.trim());
    if (!repoTrim.includes("/") || !Number.isInteger(prNum) || prNum <= 0) return;
    router.push(`/review?repo=${encodeURIComponent(repoTrim)}&pr=${prNum}`);
  }

  const hasKey = keyStatus?.present && keyStatus.status === "active";

  return (
    <main style={S.main}>
      <section style={S.hero}>
        <h1 style={S.h1}>Diffwise</h1>
        <p style={S.tagline}>
          Turn a GitHub pull request into an AI-generated, semantic-zoom review — from one-line
          intent down to the word-level diff.
        </p>
      </section>

      {!signedIn ? (
        <a href="/api/auth/github/login" style={S.primaryBtn}>
          Sign in with GitHub
        </a>
      ) : (
        <>
          {!hasKey && (
            <div style={S.notice}>
              You haven&apos;t added an Anthropic API key yet.{" "}
              <a href="/settings" style={S.link}>
                Add your key
              </a>{" "}
              to generate reviews. Your key is encrypted and never leaves the server.
            </div>
          )}
          <form onSubmit={onSubmit} style={S.form}>
            <label style={S.label}>
              Repository
              <input
                style={S.input}
                placeholder="owner/repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label style={S.label}>
              PR number
              <input
                style={S.input}
                placeholder="123"
                inputMode="numeric"
                value={pr}
                onChange={(e) => setPr(e.target.value)}
              />
            </label>
            <button type="submit" style={S.primaryBtn} disabled={!hasKey}>
              Generate Review →
            </button>
          </form>
          <div style={S.footerRow}>
            <a href="/settings" style={S.link}>
              Settings{keyStatus?.last4 ? ` · key ••••${keyStatus.last4}` : ""}
            </a>
          </div>
        </>
      )}
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  main: { maxWidth: 640, margin: "0 auto", padding: "10vh 24px", fontFamily: "system-ui, sans-serif" },
  hero: { marginBottom: 32 },
  h1: { fontSize: 44, margin: "0 0 8px", letterSpacing: -1 },
  tagline: { fontSize: 18, lineHeight: 1.5, opacity: 0.8, margin: 0 },
  form: { display: "flex", flexDirection: "column", gap: 16, marginTop: 8 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, opacity: 0.85 },
  input: { padding: "10px 12px", fontSize: 16, borderRadius: 8, border: "1px solid #8884", background: "transparent", color: "inherit" },
  primaryBtn: {
    display: "inline-block",
    padding: "12px 18px",
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    cursor: "pointer",
    textDecoration: "none",
    textAlign: "center",
  },
  notice: { padding: "12px 14px", borderRadius: 8, background: "#f59e0b22", marginBottom: 16, fontSize: 14 },
  footerRow: { marginTop: 20, fontSize: 14 },
  link: { color: "#3b82f6" },
};
