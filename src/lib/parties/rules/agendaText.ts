const DISCORD_INVITE_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite|discord\.me)\/[A-Za-z0-9-]+/gi;

export const AGENDA_INVITE_REMOVED_TEXT = "[invite link removed]";

export function containsDiscordInvite(text: string): boolean {
  DISCORD_INVITE_PATTERN.lastIndex = 0;
  return DISCORD_INVITE_PATTERN.test(text);
}

/** Display-time scrub: stored text is untouched, invites are replaced with a placeholder. */
export function neutraliseDiscordInvites(text: string): string {
  return text.replace(DISCORD_INVITE_PATTERN, AGENDA_INVITE_REMOVED_TEXT);
}
