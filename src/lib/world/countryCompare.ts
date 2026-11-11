/**
 * Selection rules for comparing two nations on the world map.
 *
 * Plain data in, plain data out, so the same selection behaviour can run in a
 * test, a harness or a future embed without React. No clock, randomness or
 * network here.
 *
 * The map holds exactly two slots, unlike the rankings page tray which refuses a
 * fourth pick. A full tray here makes room for the newer pick instead: a player
 * clicking their way across the globe should never have to clear the panel to
 * change one side, and the nation they picked longest ago is the one they are
 * least likely to still be looking at.
 */

/** How many nations the map comparison holds at once. */
export const MAP_COMPARE_SLOTS = 2;

/**
 * Add or remove one nation from a two-slot comparison.
 *
 * Clicking a selected nation removes it. Clicking a new nation fills an empty
 * slot, and on a full tray the oldest selection is dropped so the new one lands
 * in the second slot. Order is kept, because the panel reads left to right.
 */
export function toggleComparePair(
  selected: readonly string[],
  countryId: string,
  slots: number = MAP_COMPARE_SLOTS
): string[] {
  if (selected.includes(countryId)) return selected.filter((id) => id !== countryId);
  if (selected.length < slots) return [...selected, countryId];
  return [...selected.slice(1), countryId];
}

/** Whether both sides of the comparison are chosen. */
export function comparePairReady(selected: readonly string[]): boolean {
  return selected.length === MAP_COMPARE_SLOTS;
}
