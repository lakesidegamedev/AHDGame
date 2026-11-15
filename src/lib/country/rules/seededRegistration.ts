/**
 * Countries added to the registered set after worlds were already running.
 *
 * A reset writes a countryGameStates row for every registered country, marking
 * the ones its era lacks `absentInEra`. A world seeded before one of these
 * countries joined has no row for it, so without this gate the registry would
 * read it as present and the turn would simulate a country the world never
 * seeded. These countries count as registered only where a row exists, or
 * where the world has no rows at all (a reset between its sweep and the
 * enablement seeder, or a preset that seeds no era).
 */
export const ROW_GATED_COUNTRY_IDS: ReadonlySet<string> = new Set(["CA"]);

/** False for a row-gated country missing from a world that has rows. */
export function isSeededInWorld(
  countryId: string,
  hasRow: boolean,
  worldHasRows: boolean
): boolean {
  return hasRow || !worldHasRows || !ROW_GATED_COUNTRY_IDS.has(countryId);
}

/** The registered ids that a world's rows leave in, given every row's id. */
export function seededInWorld<T extends string>(
  ids: readonly T[],
  rowIds: ReadonlySet<string>
): T[] {
  return ids.filter((id) => isSeededInWorld(id, rowIds.has(id), rowIds.size > 0));
}
