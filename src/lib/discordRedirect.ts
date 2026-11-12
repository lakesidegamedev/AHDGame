import { authConfig } from "@/lib/config/auth";

/**
 * The OAuth redirect URI sent to Discord.
 *
 * Discord requires an exact match against a registered redirect_uri, and the
 * authorize and token-exchange legs must send the same string. Both read this
 * helper so they cannot disagree. The value is sent exactly as configured;
 * the environment stays authoritative.
 */
export function discordRedirectUri(): string | undefined {
  const raw = authConfig.discordRedirectUri()?.trim();
  return raw || undefined;
}
