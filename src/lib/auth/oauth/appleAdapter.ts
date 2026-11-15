import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import type { AppleIdentity } from "@/lib/auth/apple";
import { APPLE_OAUTH_RETURN_URL_COOKIE } from "@/lib/auth/lakesideLoginReturn";
import { oauthWelcomeMessage } from "./providerLogin";
import type { OAuthLinkAdapter, OAuthLoginAdapter } from "./types";

export interface AppleSignIn extends AppleIdentity {
  /** Display name Apple sent on first authorization only. */
  name: string | null;
  /** Sealed refresh token, when Apple issued one. */
  sealedRefreshToken: string | null;
}

/** Result page redirect. Apple outcomes are always per-request, so never cached. */
export function appleResult(baseUrl: string, status: string, next: string, reason?: string) {
  const params = new URLSearchParams({ status, next });
  if (reason) params.set("reason", reason);
  const response = NextResponse.redirect(new URL(`/auth/apple/result?${params}`, baseUrl));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function appleLoginAdapter(apple: AppleSignIn, baseUrl: string): OAuthLoginAdapter {
  return {
    provider: "apple",
    idField: "appleId",
    externalId: apple.sub,
    returnUrlCookie: APPLE_OAUTH_RETURN_URL_COOKIE,
    resultRedirect: (status, next, reason) => appleResult(baseUrl, status, next, reason),
    existingLoginFields: () => ({
      // Apple sends email only when the user shares it; keep the last known one otherwise.
      ...(apple.email ? { appleEmail: apple.email } : {}),
      ...(apple.sealedRefreshToken ? { appleRefreshToken: apple.sealedRefreshToken } : {}),
    }),
    newAccount: {
      usernameSeed: () => apple.name ?? "",
      fallbackUsername: () => `apple_${randomBytes(8).toString("hex")}`,
      // The Apple subject contains dots, so it is reduced to a safe local part.
      email: `apple_${apple.sub.replace(/[^A-Za-z0-9]/g, "_").slice(0, 64)}@apple.local`,
      displayName: (username) => apple.name ?? username,
      fields: (observedAt) => ({
        appleId: apple.sub,
        ...(apple.email ? { appleEmail: apple.email } : {}),
        appleLinkedAt: observedAt,
        ...(apple.sealedRefreshToken ? { appleRefreshToken: apple.sealedRefreshToken } : {}),
      }),
      adminLogDetails: "Registered via Apple",
      welcomeMessage: oauthWelcomeMessage(","),
      softAllowSeparator: ":",
      ipDetection: "lookup",
    },
  };
}

export function appleLinkAdapter(apple: AppleSignIn, baseUrl: string): OAuthLinkAdapter {
  return {
    provider: "apple",
    idField: "appleId",
    externalId: apple.sub,
    loginRequired: () => NextResponse.redirect(new URL("/login", baseUrl)),
    linkResult: (status, reason) => appleResult(baseUrl, status, "/settings", reason),
    linkFields: (linkedAt) => ({
      appleId: apple.sub,
      ...(apple.email ? { appleEmail: apple.email } : {}),
      appleLinkedAt: linkedAt,
      ...(apple.sealedRefreshToken ? { appleRefreshToken: apple.sealedRefreshToken } : {}),
    }),
  };
}
