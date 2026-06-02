# Diffwise — Setup & Deploy Runbook

This covers local development and Railway deployment for the Diffwise v1 server. See
`docs/tech-spec.md` for the full design.

## 1. Prerequisites

- **Node 22** (`.nvmrc` pins it).
- A **Postgres** database (Railway Postgres plugin in prod; local Postgres for dev).
- A **GitHub OAuth App** (not a GitHub App).
- Each user supplies their own **Anthropic API key** (BYOK) in-app — the server never
  holds a platform key.

## 2. Register the GitHub OAuth App (one-time)

GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App.

- **Homepage URL:** your app origin (e.g. `https://diffwise.up.railway.app` or `http://localhost:3000`).
- **Authorization callback URL:** `<origin>/api/auth/github/callback`.
- GitHub issues a **Client ID** and **Client Secret** (secret is server-only).

Scopes requested at sign-in: `read:user` (profile) and `repo` (read public + private repo
contents and PR diffs — OAuth Apps have no finer-grained read-only-private scope). Diffwise
is read-only; it never writes to GitHub in v1.

## 3. Generate the encryption master key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put the output in `ENCRYPTION_MASTER_KEY`. It must decode to exactly 32 bytes. It is the root
of all secret encryption (AES-256-GCM, AAD-bound to the user id) and lives **only** in an env
var — never in the DB or git. Losing it makes stored GitHub/Anthropic credentials undecryptable
(users simply re-connect / re-enter their key).

**Rotation:** move the current key to `ENCRYPTION_MASTER_KEY_V<n>` and set a new
`ENCRYPTION_MASTER_KEY`. New writes use the new version; old rows still decrypt via the
versioned key registry (`src/server/crypto.ts`). `crypto.ts` is the single crypto boundary —
the documented one-file upgrade path to an external KMS (Infisical / AWS KMS) only changes
`getKey`/`encrypt`/`decrypt` (they become async; callers already await via the store).

## 4. Environment variables

Copy `.env.example` to `.env.local` (dev) and fill in. Authoritative set:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. |
| `ENCRYPTION_MASTER_KEY` | base64 32-byte AES-256-GCM master key (§3). |
| `ENCRYPTION_MASTER_KEY_V2`/`_V3` | optional older keys for rotation. |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App credentials. |
| `GITHUB_OAUTH_CALLBACK_URL` | `<origin>/api/auth/github/callback`. |
| `APP_BASE_URL` | public app origin. |
| `SESSION_COOKIE_SECRET` | optional, only if signing the session cookie. |
| `ANTHROPIC_MODEL` | pinned `claude-opus-4-8` (do not change). |
| `DIFFWISE_MAX_CHANGED_LINES` | hard PR cap, default `10000`. |
| `MAX_CONCURRENT_GENERATIONS` | global generation semaphore, default `4`. |
| `RATE_LIMIT_GEN_PER_MIN` / `RATE_LIMIT_GEN_PER_HOUR` | per-user generation limits. |

There is intentionally **no `ANTHROPIC_API_KEY`** — inference is BYOK.

## 5. Database schema

```bash
npm run db:generate   # generate SQL migration from src/server/db/schema.ts
npm run db:migrate    # apply migrations to DATABASE_URL
```

The schema is exactly three tables — `users`, `sessions`, `credentials` (ciphertext-only).
**No generated content (diffs, MODEL, reviews) is ever stored.** `gen_random_uuid()` is built
into Postgres 13+; on older servers `CREATE EXTENSION IF NOT EXISTS pgcrypto;` first.

## 6. Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, ENCRYPTION_MASTER_KEY, GitHub OAuth
npm run db:migrate
npm run dev                  # http://localhost:3000
```

Sign in with GitHub → add your Anthropic key in Settings → enter `owner/repo` + a PR number →
see the cost/time estimate → Generate.

## 7. Build verification (no live services needed)

```bash
npm run typecheck            # tsc --noEmit (strict)
ENCRYPTION_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") \
  npm run build              # next build — does not contact GitHub/Anthropic/Postgres
```

## 8. Deploy on Railway

- One **web service** (this repo) + one **Postgres plugin**.
- Build: `next build`. Start: `next start -p $PORT` (long-lived Node 22 container — no
  serverless duration cap, required for the 30s–2min synchronous SSE generation).
- Health check: `GET /api/health` (200 + DB ping).
- Set all env vars from §4 as Railway service variables. Run `npm run db:migrate` on
  release. Point the GitHub OAuth callback URL at the deployed origin.

## 9. Deferred scaling escape hatches (documented, not built)

- **Worker queue:** if inline synchronous generation outgrows the single container, extract
  the pipeline into a worker and have `/api/generate` subscribe to the worker's stream. No
  change to the SSE contract (§2.6).
- **External KMS:** swap `crypto.ts`'s `getKey`/`encrypt`/`decrypt` for envelope encryption
  via Infisical/AWS KMS (add a nullable `wrapped_dek` column under that mode).
