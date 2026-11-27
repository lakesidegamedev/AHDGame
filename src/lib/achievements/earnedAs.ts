/**
 * Which character earned an award, as players see it. Client safe: no database.
 *
 * Award rows store the earning character's name at award time, so an award
 * keeps that name after the character is retired, reset or replaced. A label
 * is only worth showing when it names someone other than the profile in view.
 */
export const EARNED_AS_NAME_MAX_LENGTH = 120;

/** Trimmed stored name, or null when nothing usable was stored. */
export function normalizeEarnedAsName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, EARNED_AS_NAME_MAX_LENGTH);
}

/**
 * The name to show as "Earned as <name>", or null when the award was earned
 * under the name being viewed or no name was stored (older awards).
 */
export function earnedAsName(
  storedName: string | null | undefined,
  viewedName: string | null | undefined
): string | null {
  const stored = normalizeEarnedAsName(storedName);
  if (!stored) return null;
  const viewed = normalizeEarnedAsName(viewedName);
  if (viewed && viewed.toLowerCase() === stored.toLowerCase()) return null;
  return stored;
}
