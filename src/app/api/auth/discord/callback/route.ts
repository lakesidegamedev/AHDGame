import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/mongodb";
import { exchangeCodeForToken, fetchDiscordUser } from "@/lib/discord";
import { discordRedirectUri } from "@/lib/discordRedirect";
import { getClientIp, getBaseUrl } from "@/lib/utils/network";
import { getCfFingerprint } from "@/lib/utils/cfFingerprint";
import { appHandbackPage, shouldHandBackToApp } from "@/lib/discordAppHandback";
import { AUTH_LIMITS, checkRateLimit } from "@/lib/api/rateLimit";
import { authConfig } from "@/lib/config/auth";
import { runOAuthLogin } from "@/lib/auth/oauth/providerLogin";
import { runOAuthLink } from "@/lib/auth/oauth/providerLink";
import { discordLinkAdapter, discordLoginAdapter } from "@/lib/auth/oauth/discordAdapter";

// GET /api/auth/discord/callback — Handles the Discord OAuth callback to log in or register a user via Discord.
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
  // OAuth callbacks are browser navigations — redirect on rate limit instead of returning JSON
  const isRateLimited = !limit.ok;

  const cookieStore = await cookies();
  const modeCookie = cookieStore.get("discord_oauth_mode");
  const mode = modeCookie?.value;
  cookieStore.delete("discord_oauth_mode");

  // Default redirect target when we don't yet know the intended mode
  const defaultNext = mode === "login" ? "/login" : "/settings";

  function resultUrl(status: string, reason?: string, next = defaultNext) {
    const params = new URLSearchParams({ status, next });
    if (reason) params.set("reason", reason);
    return new URL(`/auth/discord/result?${params.toString()}`, baseUrl);
  }

  // Link-mode outcomes are per-account: keep them out of caches. Login-mode
  // outcomes stay untouched (no login refactor). An unknown mode defaults to
  // the link target, so only an explicit login mode skips the stamp.
  const linkRedirect = (url: URL) => {
    const response = NextResponse.redirect(url);
    if (mode !== "login") response.headers.set("Cache-Control", "no-store");
    return response;
  };

  if (isRateLimited) {
    return linkRedirect(resultUrl("error", "rate_limited"));
  }

  if (!mode) {
    // The Android app sent Discord's consent page out to the system and the
    // phone's browser followed the redirect here. Send it back to the app.
    if (shouldHandBackToApp(state, code, request.headers.get("user-agent"))) {
      return appHandbackPage(new URL(`${url.pathname}${url.search}`, baseUrl));
    }
    return linkRedirect(resultUrl("error", "session_expired"));
  }

  const isLoginMode = mode === "login";

  // Handle Discord errors (user denied, etc.) — sanitize to known values to prevent injection
  const KNOWN_DISCORD_ERRORS = [
    "access_denied",
    "invalid_scope",
    "invalid_request",
    "server_error",
  ];
  if (error) {
    const safeReason = KNOWN_DISCORD_ERRORS.includes(error) ? error : "exchange_failed";
    return linkRedirect(resultUrl("error", safeReason));
  }

  if (!code || !state) {
    return linkRedirect(resultUrl("error", "missing_params", isLoginMode ? "/login" : "/settings"));
  }

  // Verify state token
  const storedState = cookieStore.get("discord_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    return linkRedirect(resultUrl("error", "invalid_state"));
  }

  cookieStore.delete("discord_oauth_state");

  const clientId = authConfig.discordClientId();
  const clientSecret = authConfig.discordClientSecret();
  const redirectUri = discordRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) {
    return linkRedirect(resultUrl("error", "not_configured"));
  }

  try {
    // Exchange code for token
    const tokenData = await exchangeCodeForToken(code, redirectUri, clientId, clientSecret);

    // Fetch Discord user info
    const discordUser = await fetchDiscordUser(tokenData.access_token);
    if (!discordUser?.id || typeof discordUser.id !== "string" || !discordUser.username) {
      throw new Error("Invalid Discord user data");
    }

    const db = await getDb();
    const userAgent = request.headers.get("user-agent");
    const cf = getCfFingerprint(request.headers);

    if (isLoginMode) {
      return runOAuthLogin(
        db,
        discordLoginAdapter(discordUser, baseUrl),
        cookieStore,
        baseUrl,
        userAgent,
        cf
      );
    } else {
      return await runOAuthLink(
        db,
        discordLinkAdapter(discordUser, baseUrl, cookieStore),
        cookieStore,
        state
      );
    }
  } catch (err) {
    if (isLoginMode) console.error("Discord OAuth error:", err);
    else console.error("Discord account link is temporarily unavailable");
    const failed = NextResponse.redirect(resultUrl("error", "exchange_failed"));
    if (!isLoginMode) failed.headers.set("Cache-Control", "no-store");
    return failed;
  }
}
