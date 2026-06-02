/**
 * Custom GitHub OAuth App flow (§3.3) — NOT Auth.js. Three pure-ish helpers:
 *   buildAuthorizeUrl  -> the authorize redirect target (scope 'read:user repo',
 *                         allow_signup=false, CSRF `state`).
 *   exchangeCodeForToken -> POST the code (+ server-only client secret) for a token.
 *   fetchGithubUser    -> GET https://api.github.com/user with the token.
 *
 * The GitHub access token returned here is encrypted into `credentials` by the
 * callback handler and JIT-decrypted only when fetching a PR diff. It is never
 * sent to the browser and never logged.
 */
import { env } from "@/server/config/env";
import { DiffwiseError } from "@/lib/model/errors";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_API_URL = "https://api.github.com/user";

/** GitHub's OAuth scopes for v1: identity + full (read-used) repo access (§3.3). */
const SCOPE = "read:user repo";

export interface GithubTokenResponse {
  access_token: string;
  scope: string;
  token_type: string;
}

export interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
}

/**
 * Build the GitHub authorize URL for the login handler (§3.3). `state` is the
 * caller-generated CSRF token also stored in the short-lived `oauth_state` cookie.
 */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_CLIENT_ID,
    redirect_uri: env.GITHUB_OAUTH_CALLBACK_URL,
    scope: SCOPE,
    state,
    allow_signup: "false",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange the OAuth `code` for an access token (§3.3). Requires the server-only
 * client secret. Throws DiffwiseError('GITHUB_AUTH') if GitHub returns no token.
 */
export async function exchangeCodeForToken(code: string): Promise<GithubTokenResponse> {
  const res = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_OAUTH_CALLBACK_URL,
    }),
  });

  if (!res.ok) {
    throw new DiffwiseError("GITHUB_ACCESS_DENIED", {
      message: `GitHub sign-in failed (token exchange ${res.status}). Try signing in again.`,
    });
  }

  const json = (await res.json()) as Partial<GithubTokenResponse> & { error?: string };
  if (!json.access_token) {
    throw new DiffwiseError("GITHUB_ACCESS_DENIED", {
      message: "GitHub sign-in failed (no access token returned). Try signing in again.",
    });
  }

  return {
    access_token: json.access_token,
    scope: json.scope ?? "",
    token_type: json.token_type ?? "bearer",
  };
}

/**
 * Fetch the authenticated user's profile (§3.3 step 4) for upserting `users`.
 * Throws DiffwiseError('GITHUB_AUTH') on a non-OK response (e.g. revoked token).
 */
export async function fetchGithubUser(token: string): Promise<GithubUser> {
  const res = await fetch(USER_API_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "diffwise",
    },
  });

  if (!res.ok) {
    throw new DiffwiseError("GITHUB_ACCESS_DENIED", {
      message: `GitHub sign-in failed (profile fetch ${res.status}). Try signing in again.`,
    });
  }

  const json = (await res.json()) as {
    id: number;
    login: string;
    name?: string | null;
    avatar_url?: string | null;
    email?: string | null;
  };

  return {
    id: json.id,
    login: json.login,
    name: json.name ?? null,
    avatar_url: json.avatar_url ?? null,
    email: json.email ?? null,
  };
}
