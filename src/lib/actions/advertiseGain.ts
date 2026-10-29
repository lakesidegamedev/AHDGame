/**
 * Base favorability gain for one "Run Advertisements" action, before stat
 * scaling. Shared by player actions and NPP turn processing so the two stay at
 * parity: base +3, diminishing returns above 70% favorability (-0.1 per point
 * over 70), floored at 1 so an ad is never fully wasted. `effectivenessMult`
 * carries the player's charisma multiplier; NPPs pass the default 1.
 *
 * Lives in its own dependency-free module so client code (wiki charts) can
 * import it without pulling the rest of the action rules.
 */
export function advertiseFavorabilityGain(
  currentFavorability: number,
  effectivenessMult = 1
): number {
  const baseGain = 3;
  const penalty = currentFavorability > 70 ? (currentFavorability - 70) * 0.1 : 0;
  return Math.max(1, Math.floor((baseGain - penalty) * effectivenessMult));
}
