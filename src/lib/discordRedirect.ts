/**
 * The OAuth redirect URI sent to Discord.
 *
 * Discord only accepts a redirect_uri that exactly matches one registered for
 * the application, and the authorize request and the token exchange must send
 * the same string. Production drifted to the `www.` host while the Discord app
 * lists the apex, so Discord rejected the sign-in before consent (#4466).
 *
 * The deployment serves both hosts from one app, so normalise to the apex here
 * rather than trusting whatever the environment happens to say. One helper, one
 * value, no chance of the two legs disagreeing.
 */
export function discordRedirectUri(): string | undefined {
  const raw = process.env.DISCORD_REDIRECT_URI?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.hostname.startsWith("www.")) url.hostname = url.hostname.slice(4);
    return url.toString();
  } catch {
    // Not a URL: hand it back untouched so the misconfiguration surfaces where
    // Discord rejects it, rather than being silently rewritten into something
    // else that also fails.
    return raw;
  }
}
