/**
 * Per-deployment auth cookie name.
 *
 * A shared `auth-token` name on `.ahousedividedgame.com` made sandbox and
 * live session cookies collide: a request to either subdomain with the
 * other env's JWT would fail lookup, clear the cookie, and log the user out
 * of both. Suffixing with the Railway service tag isolates cookies per
 * environment.
 *
 * Mirrors the Sentry cron monitor slug in cron.ts.
 */
export function computeAuthCookieName(env: NodeJS.ProcessEnv = process.env): string {
  const tag = (env.RAILWAY_SERVICE_NAME ?? env.RAILWAY_ENVIRONMENT_NAME ?? "local")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `auth-token-${tag || "local"}`;
}

/** Resolved at module load — env is stable for the process lifetime. */
export const AUTH_COOKIE_NAME = computeAuthCookieName();
