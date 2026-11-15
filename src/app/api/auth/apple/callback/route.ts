import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/mongodb";
import {
  exchangeAppleCode,
  getAppleSignInConfig,
  parseAppleUserName,
  sealAppleRefreshToken,
  verifyAppleIdToken,
} from "@/lib/auth/apple";
import { getClientIp, getBaseUrl } from "@/lib/utils/network";
import { getCfFingerprint } from "@/lib/utils/cfFingerprint";
import { AUTH_LIMITS, checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { runOAuthLogin } from "@/lib/auth/oauth/providerLogin";
import { runOAuthLink } from "@/lib/auth/oauth/providerLink";
import {
  appleLinkAdapter,
  appleLoginAdapter,
  appleResult,
  type AppleSignIn,
} from "@/lib/auth/oauth/appleAdapter";

const CALLBACK_PATH = "/api/auth/apple/callback";
const MAX_PARAM_LENGTH = 4096;

function boundedField(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_PARAM_LENGTH
    ? value
    : null;
}

// POST /api/auth/apple/callback — Receives Apple's form_post and bounces it to the GET handler.
// Auth: public
// Errors: (none; every outcome is a redirect)
// Apple POSTs cross-site, so Lax state cookies are not sent with this request.
// A 303 turns it into a top-level same-site GET, which does carry them. No
// state is read or written here.
export async function POST(request: Request) {
  const baseUrl = getBaseUrl(request);
  const target = new URL(CALLBACK_PATH, baseUrl);
  try {
    const form = await request.formData();
    const code = boundedField(form.get("code"));
    const state = boundedField(form.get("state"));
    const error = boundedField(form.get("error"));
    const name = parseAppleUserName(boundedField(form.get("user")));
    if (code) target.searchParams.set("code", code);
    if (state) target.searchParams.set("state", state);
    if (error) target.searchParams.set("error", error);
    if (name) target.searchParams.set("name", name);
  } catch {
    target.searchParams.set("error", "invalid_request");
  }
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

// GET /api/auth/apple/callback — Completes Sign in with Apple: log in, register, or link.
// Auth: public
// Errors: 429
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const name = url.searchParams.get("name")?.slice(0, 64) || null;

  const baseUrl = getBaseUrl(request);
  const clientIp = await getClientIp();
  const limit = checkRateLimit(clientIp, AUTH_LIMITS.maxRequests, AUTH_LIMITS.windowMs);
  if (!limit.ok) {
    const limited = rateLimitResponse(limit.retryAfter);
    limited.headers.set("Cache-Control", "no-store");
    return limited;
  }

  const cookieStore = await cookies();
  const mode = cookieStore.get("apple_oauth_mode")?.value ?? "link";
  cookieStore.delete("apple_oauth_mode");
  const storedNonce = cookieStore.get("apple_oauth_nonce")?.value;
  cookieStore.delete("apple_oauth_nonce");

  const isLoginMode = mode === "login";
  const defaultNext = isLoginMode ? "/login" : "/settings";

  const resultRedirect = (status: string, reason?: string) =>
    appleResult(baseUrl, status, defaultNext, reason);

  if (error) {
    return resultRedirect(
      "error",
      error === "user_cancelled_authorize" ? "access_denied" : "exchange_failed"
    );
  }
  if (!code || !state) {
    return resultRedirect("error", "missing_params");
  }

  const storedState = cookieStore.get("apple_oauth_state")?.value;
  if (!storedState || storedState !== state || !storedNonce) {
    return resultRedirect("error", "invalid_state");
  }
  cookieStore.delete("apple_oauth_state");

  const config = getAppleSignInConfig();
  if (!config) {
    return resultRedirect("error", "not_configured");
  }

  try {
    const tokens = await exchangeAppleCode(config, code);
    const identity = await verifyAppleIdToken(config, tokens.id_token, storedNonce);
    const apple: AppleSignIn = {
      ...identity,
      name,
      sealedRefreshToken: tokens.refresh_token ? sealAppleRefreshToken(tokens.refresh_token) : null,
    };

    const db = await getDb();
    if (isLoginMode) {
      const userAgent = request.headers.get("user-agent");
      const cf = getCfFingerprint(request.headers);
      return await runOAuthLogin(
        db,
        appleLoginAdapter(apple, baseUrl),
        cookieStore,
        baseUrl,
        userAgent,
        cf
      );
    }
    return await runOAuthLink(db, appleLinkAdapter(apple, baseUrl), cookieStore, state);
  } catch (err) {
    if (isLoginMode) console.error("Apple sign-in error:", err);
    else console.error("Apple account link is temporarily unavailable");
    return resultRedirect("error", "exchange_failed");
  }
}
