/**
 * Mutation handlers that are reachable without a recognised guard on purpose.
 * Key: `<route file> <METHOD>`. Every entry needs a one-line reason saying
 * what bounds the endpoint instead of a session. Review before adding.
 */
export const PUBLIC_MUTATION_ROUTES: Record<string, string> = {
  "src/app/api/analytics/intake/route.ts POST":
    "Anonymous signup funnel event; rate limited per IP, bot user agents dropped.",
  "src/app/api/analytics/pageview/route.ts POST":
    "Anonymous page view; session read only to mark the view as signed in.",
  "src/app/api/auth/apple/callback/route.ts POST":
    "Apple form-post callback; only redirects to the GET callback, no state read or written.",
  "src/app/api/auth/confirm-email/route.ts POST":
    "Possession of the single-use email change token is the credential.",
  "src/app/api/auth/forgot-password/route.ts POST":
    "Pre-login password reset request; Turnstile and durable rate limit.",
  "src/app/api/auth/login/route.ts POST": "Pre-login credential check; durable rate limit.",
  "src/app/api/auth/logout/route.ts POST":
    "Revokes only the presented session; an anonymous call just clears cookies.",
  "src/app/api/auth/migration/source-proof/load/route.ts POST":
    "Machine call authorised by a constant-time shared secret check in the route.",
  "src/app/api/auth/migration/start/route.ts POST":
    "Pre-login account migration proven by password; disabled by default, rate limited.",
  "src/app/api/auth/register/route.ts POST": "Pre-login account creation; durable rate limit.",
  "src/app/api/auth/reset-password/route.ts POST":
    "Possession of the single-use password reset token is the credential.",
  "src/app/api/client/diagnostics/route.ts POST":
    "Anonymous client crash report; size capped and globally budgeted.",
  "src/app/api/client/statistics/route.ts POST":
    "Anonymous opt-in desktop statistics; size capped and globally budgeted.",
  "src/app/api/feedback/route.ts POST":
    "Public feedback form; rate limited, session read only for attribution.",
  "src/app/api/player-ads/[id]/view/route.ts POST":
    "Ad impression counter; deduplicated per viewer and rate limited.",
  "src/app/api/push/device/route.ts DELETE":
    "Possession of the installation secret revokes that one device after sign-out.",
  "src/app/api/seed/route.ts POST":
    "Machine call authorised by a constant-time bearer secret check in the route.",
  "src/app/api/suggestions/route.ts POST":
    "Public suggestion form; rate limited, session read only for attribution.",
  "src/app/api/wiki/report/route.ts POST":
    "Public wiki error report; rate limited, session read only for attribution.",
};
