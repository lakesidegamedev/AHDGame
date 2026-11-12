import { NextResponse } from "next/server";
import { GOOGLE_OAUTH_RETURN_URL_COOKIE } from "@/lib/auth/lakesideLoginReturn";
import { oauthWelcomeMessage } from "./providerLogin";
import { noStoreRedirect, providerResultUrl } from "./providerResult";
import type { OAuthLinkAdapter, OAuthLoginAdapter } from "./types";

export interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

export function googleLoginAdapter(user: GoogleProfile, baseUrl: string): OAuthLoginAdapter {
  return {
    provider: "google",
    idField: "googleId",
    externalId: user.id,
    returnUrlCookie: GOOGLE_OAUTH_RETURN_URL_COOKIE,
    resultRedirect: (status, next, reason) =>
      NextResponse.redirect(providerResultUrl("google", baseUrl, status, next, reason)),
    existingLoginFields: () => ({
      googleEmail: user.email,
      googleName: user.name,
      googleAvatar: user.picture ?? undefined,
    }),
    newAccount: {
      usernameSeed: () => user.name,
      // Google ids are unique per user, so this cannot collide.
      fallbackUsername: () => `google_${user.id}`.slice(0, 32),
      email: `google_${user.id}@google.local`,
      displayName: () => user.name,
      fields: () => ({
        googleId: user.id,
        googleEmail: user.email,
        googleName: user.name,
        googleAvatar: user.picture ?? undefined,
        googleLinkedAt: new Date(),
      }),
      adminLogDetails: `Registered via Google (${user.email})`,
      welcomeMessage: oauthWelcomeMessage(" \u2014"),
      softAllowSeparator: " \u2014",
      ipDetection: "lookup",
    },
  };
}

export function googleLinkAdapter(user: GoogleProfile, baseUrl: string): OAuthLinkAdapter {
  return {
    provider: "google",
    idField: "googleId",
    externalId: user.id,
    loginRequired: () => noStoreRedirect(new URL("/login", baseUrl)),
    linkResult: (status, reason) =>
      noStoreRedirect(providerResultUrl("google", baseUrl, status, "/settings", reason)),
    linkFields: (linkedAt) => ({
      googleId: user.id,
      googleEmail: user.email,
      googleName: user.name,
      googleAvatar: user.picture ?? undefined,
      googleLinkedAt: linkedAt,
    }),
  };
}
