import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/mongodb";
import { exchangeGoogleCode, fetchGoogleUser } from "@/lib/google";
import { getClientIp, getBaseUrl } from "@/lib/utils/network";
import { getCfFingerprint } from "@/lib/utils/cfFingerprint";
import { AUTH_LIMITS, checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { authConfig } from "@/lib/config/auth";
import { runOAuthLogin } from "@/lib/auth/oauth/providerLogin";
import { runOAuthLink } from "@/lib/auth/oauth/providerLink";
import { googleLinkAdapter, googleLoginAdapter } from "@/lib/auth/oauth/googleAdapter";

// GET /api/auth/google/callback — Handles the Google OAuth callback to log in or register a user via Google.
// Auth: public
// Errors: 429
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const baseUrl = getBaseUrl(request);
  const clientIp = await getClientIp();
  const limit = checkRateLimit(clientIp, AUTH_LIMITS.maxRequests, AUTH_LIMITS.windowMs);
  if (!limit.ok) {
    // Error responses carry per-request quota state: never cache them.
    const limited = rateLimitResponse(limit.retryAfter);
    limited.headers.set("Cache-Control", "no-store");
    return limited;
  }

  const cookieStore = await cookies();
  const mode = cookieStore.get("google_oauth_mode")?.value ?? "link";
  cookieStore.delete("google_oauth_mode");

  const isLoginMode = mode === "login";
  const defaultNext = isLoginMode ? "/login" : "/settings";

  function resultUrl(status: string, reason?: string, next = defaultNext) {
    const params = new URLSearchParams({ status, next });
    if (reason) params.set("reason", reason);
    return new URL(`/auth/google/result?${params.toString()}`, baseUrl);
  }

  // Link-mode outcomes are per-account: keep them out of caches. Login-mode
  // outcomes stay untouched (no login refactor).
  function callbackRedirect(url: URL) {
    const response = NextResponse.redirect(url);
    if (!isLoginMode) response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (error) {
    const safeReason = error === "access_denied" ? "access_denied" : "exchange_failed";
    return callbackRedirect(resultUrl("error", safeReason));
  }

  if (!code || !state) {
    return callbackRedirect(resultUrl("error", "missing_params"));
  }

  const storedState = cookieStore.get("google_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return callbackRedirect(resultUrl("error", "invalid_state"));
  }
  cookieStore.delete("google_oauth_state");

  const clientId = authConfig.googleClientId();
  const clientSecret = authConfig.googleClientSecret();
  const redirectUri = authConfig.googleRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) {
    return callbackRedirect(resultUrl("error", "not_configured"));
  }

  try {
    const tokenData = await exchangeGoogleCode(code, redirectUri, clientId, clientSecret);
    const googleUser = await fetchGoogleUser(tokenData.access_token);

    if (!googleUser?.id || typeof googleUser.id !== "string") {
      throw new Error("Invalid Google user data");
    }

    const db = await getDb();
    const userAgent = request.headers.get("user-agent");
    const cf = getCfFingerprint(request.headers);

    if (isLoginMode) {
      return await runOAuthLogin(
        db,
        googleLoginAdapter(googleUser, baseUrl),
        cookieStore,
        baseUrl,
        userAgent,
        cf
      );
    } else {
      return await runOAuthLink(db, googleLinkAdapter(googleUser, baseUrl), cookieStore, state);
    }
  } catch (err) {
    if (isLoginMode) console.error("Google OAuth error:", err);
    else console.error("Google account link is temporarily unavailable");
    return callbackRedirect(resultUrl("error", "exchange_failed"));
  }
}
