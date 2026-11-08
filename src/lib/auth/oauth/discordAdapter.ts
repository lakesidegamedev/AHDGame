import { NextResponse } from "next/server";
import { DISCORD_OAUTH_RETURN_URL_COOKIE } from "@/lib/auth/lakesideLoginReturn";
import { oauthWelcomeMessage } from "./providerLogin";
import { noStoreRedirect, providerResultUrl } from "./providerResult";
import type { OAuthCookieStore, OAuthLinkAdapter, OAuthLoginAdapter } from "./types";

export interface DiscordProfile {
  id: string;
  username: string;
  avatar: string | null;
}

const LINK_RETURN_COOKIE = "discord_oauth_return_url";

export function discordLoginAdapter(user: DiscordProfile, baseUrl: string): OAuthLoginAdapter {
  return {
    provider: "discord",
    idField: "discordId",
    externalId: user.id,
    returnUrlCookie: DISCORD_OAUTH_RETURN_URL_COOKIE,
    resultRedirect: (status, next, reason) =>
      NextResponse.redirect(providerResultUrl("discord", baseUrl, status, next, reason)),
    existingLoginFields: () => ({
      discordUsername: user.username,
      discordAvatar: user.avatar ?? undefined,
    }),
    newAccount: {
      usernameSeed: () => user.username,
      // Discord ids are unique per user, so this cannot collide.
      fallbackUsername: () => `discord_${user.id}`.slice(0, 32),
      email: `discord_${user.id}@discord.local`,
      displayName: () => user.username,
      fields: () => ({
        discordId: user.id,
        discordUsername: user.username,
        discordAvatar: user.avatar ?? undefined,
        discordLinkedAt: new Date(),
      }),
      adminLogDetails: `Registered via Discord (${user.username})`,
      welcomeMessage: oauthWelcomeMessage(" \u2014"),
      softAllowSeparator: " \u2014",
      ipDetection: "inline",
    },
  };
}

/**
 * Link-flow adapter. Reads and clears the return URL stored by the Discord
 * start route so callers outside /settings (e.g. create-character) land back
 * on the right page.
 */
export function discordLinkAdapter(
  user: DiscordProfile,
  baseUrl: string,
  cookieStore: OAuthCookieStore
): OAuthLinkAdapter {
  const returnUrlCookie = cookieStore.get(LINK_RETURN_COOKIE)?.value;
  cookieStore.delete(LINK_RETURN_COOKIE);
  const returnUrl = returnUrlCookie ?? "/settings";

  return {
    provider: "discord",
    idField: "discordId",
    externalId: user.id,
    loginRequired: () => noStoreRedirect(new URL("/login", baseUrl)),
    linkResult: (status, reason) =>
      noStoreRedirect(providerResultUrl("discord", baseUrl, status, returnUrl, reason)),
    linkFields: (linkedAt) => ({
      discordId: user.id,
      discordUsername: user.username,
      discordAvatar: user.avatar ?? undefined,
      discordLinkedAt: linkedAt,
    }),
  };
}
