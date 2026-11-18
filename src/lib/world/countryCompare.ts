/**
 * Selection rules for comparing two nations on the world map. Pure: no React,
 * clock, randomness or network.
 *
 * The map holds two slots. A full tray drops the oldest pick to make room, so a
 * player clicking across the globe never has to clear the panel to change one side.
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

/**
 * The `compare` query value for a shared map link, in panel order.
 *
 * Ids are country ids (not ISO numbers), uppercase, so the link reads as
 * `/world?compare=FR,JP`. Order is kept because the panel reads left to right.
 */
export function compareShareParam(selected: readonly string[]): string {
  return selected.filter(Boolean).slice(0, MAP_COMPARE_SLOTS).join(",");
}

/**
 * Read a shared `compare` value back into a selection.
 *
 * The value arrives from a URL, so it is untrusted: unknown countries, blanks,
 * duplicates and anything past the two slots are dropped rather than trusted.
 * A link that names one real country opens with that side filled, and junk
 * opens nothing at all.
 */
export function parseCompareShareParam(
  value: string | null | undefined,
  allowed: ReadonlySet<string>
): string[] {
  if (!value) return [];
  const picked: string[] = [];
  for (const raw of value.split(",")) {
    const id = raw.trim();
    if (!id || picked.includes(id) || !allowed.has(id)) continue;
    picked.push(id);
    if (picked.length === MAP_COMPARE_SLOTS) break;
  }
  return picked;
}
