/**
 * The OAuth redirect URI sent to Discord.
 *
 * Discord only accepts a redirect_uri that exactly matches one registered for
 * the application, and the authorize request and the token exchange must send
 * the same string. Both legs read this one helper so they can never disagree.
 *
 * The value is sent exactly as configured. Production registers the www host;
 * an earlier rewrite to the apex (#4466) sent an address Discord does not have
 * and broke every Discord sign-in, so the environment stays authoritative.
 */
export function discordRedirectUri(): string | undefined {
  const raw = process.env.DISCORD_REDIRECT_URI?.trim();
  return raw || undefined;
}
