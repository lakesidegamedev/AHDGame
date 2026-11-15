/** Discord linking for new characters. The operator's requirement defaults off;
 * requiresDiscordForNewCharacter applies only to a new creation, never to play.
 * An account linked to Apple is exempt: Apple sign-in is already a verified
 * identity, so only email and Google accounts must link Discord. The caller
 * passes `appleId` only while the exemption still holds, which is once per
 * Apple ID (see appleExemptionHolds).
 */
export function requiresDiscordForNewCharacter(
  required: boolean | undefined,
  discordId: string | undefined | null,
  appleId?: string | undefined | null
): boolean {
  return required === true && !discordId?.trim() && !appleId?.trim();
}
