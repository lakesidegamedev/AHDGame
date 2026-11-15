export const APPLE_EXEMPT_LABEL =
  "Signed in with Apple: exempt from the Discord requirement for new characters";

/** True when an Apple sign-in is linked. Never expose the id itself. */
export function isAppleLinked(user: { appleId?: string | null }): boolean {
  return typeof user.appleId === "string" && user.appleId.length > 0;
}

/** Staff filter: no Discord on the account, but an Apple sign-in is linked. */
export function isNoDiscordAppleLinked(user: {
  appleLinked?: boolean;
  discordId?: string | null;
  discordUsername?: string | null;
}): boolean {
  return user.appleLinked === true && !user.discordId && !user.discordUsername;
}
