import type { NextResponse } from "next/server";
import type { cookies } from "next/headers";
import type { getDb } from "@/lib/mongodb";

export type OAuthProvider = "discord" | "google" | "apple";
export type OAuthDb = Awaited<ReturnType<typeof getDb>>;
export type OAuthCookieStore = Awaited<ReturnType<typeof cookies>>;

interface OAuthIdentityAdapter {
  provider: OAuthProvider;
  /** User document field that stores this provider's account id. */
  idField: "discordId" | "googleId" | "appleId";
  /** The provider's stable account id for the person who just signed in. */
  externalId: string;
}

export interface OAuthLoginAdapter extends OAuthIdentityAdapter {
  /** Cookie that may carry a stashed SSO continuation for after login. */
  returnUrlCookie: string;
  /** Redirect to the provider's result page. Cache headers are the provider's own. */
  resultRedirect(status: string, next: string, reason?: string): NextResponse;
  /** Provider profile fields refreshed on every login by an existing account. */
  existingLoginFields(): Record<string, unknown>;
  newAccount: {
    /** Raw text the new username is derived from. */
    usernameSeed(): string;
    /** Username used when every derived candidate is taken. */
    fallbackUsername(): string;
    /** Unique placeholder email marking a provider-only account. */
    email: string;
    displayName(username: string): string;
    /** Provider id and profile fields written on the new user document. */
    fields(observedAt: Date): Record<string, unknown>;
    adminLogDetails: string;
    welcomeMessage: string;
    /** Separator placed after the device in the CGNAT soft-allow admin log. */
    softAllowSeparator: string;
    /**
     * "inline" reads the flag from the gameConfig document already loaded for
     * the maintenance check; "lookup" queries it separately.
     */
    ipDetection: "inline" | "lookup";
  };
}

export interface OAuthLinkAdapter extends OAuthIdentityAdapter {
  /** Redirect to /login when there is no current session to link into. */
  loginRequired(): NextResponse;
  /** Result page redirect for a link outcome. */
  linkResult(status: "success" | "error", reason?: string): NextResponse;
  /** Provider fields written onto the signed-in account. */
  linkFields(linkedAt: Date): Record<string, unknown>;
}
