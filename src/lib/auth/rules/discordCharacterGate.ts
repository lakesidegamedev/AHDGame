/** Discord linking for new characters. The operator's requirement defaults off;
 * requiresDiscordForNewCharacter applies only to a new creation, never to play.
 */
export function requiresDiscordForNewCharacter(
  required: boolean | undefined,
  discordId: string | undefined | null
): boolean {
  return required === true && !discordId?.trim();
}
