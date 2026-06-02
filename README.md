# Diffwise

AI-generated **semantic-zoom diff review** for GitHub pull requests. Sign in with GitHub,
bring your own Anthropic API key, point at `owner/repo` + a PR number, and Diffwise streams a
rich, multi-level review — from one-line intent down to the word-level diff, plus a guided
story mode and a static before/after architecture view.

- **Stack:** Next.js (App Router) + React + TypeScript on a long-lived Node server (Railway) + Postgres.
- **Privacy by construction:** the only persisted data is your account + your AES-256-GCM-encrypted
  GitHub token and Anthropic key. Diffs, the AI MODEL, and reviews are **never** stored — they
  live only in your browser tab for the session.
- **Generation:** server-side, synchronous SSE streaming; your Anthropic key never enters the browser.

See **[docs/setup.md](docs/setup.md)** to run/deploy and **[docs/tech-spec.md](docs/tech-spec.md)**
for the full design.
