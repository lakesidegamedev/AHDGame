import type { Db } from "mongodb";
import { getEnactedLevel } from "@/lib/politicalLegislation/enactedLevels";
import { carriedLawIdFor } from "@/lib/politicalLegislation/carriedLaw";
import type { LawCountryId } from "@/lib/politicalLegislation/types";
import {
  RESERVE_LAW_BY_COUNTRY,
  stanceForReserveLevel,
  resolveConscriptionStance,
  type ConscriptionStance,
} from "./manpower";

/**
 * The stance in force: a playable nation's enacted reserve-forces law, else the
 * default stance table.
 *
 * The short-circuit matters: `getEnactedLevel` returns the authored baseline
 * when a nation simply has not legislated, but 0 for an unknown law id, which
 * would silently strip manpower instead of falling back.
 *
 * A survivor of a country merge inherits the absorbed state's catalogue, so a
 * nation with no reserve law of its own can still answer through a carried one.
 * The native entry wins the lookup, matching the merge rule (survivor's law
 * governs).
 *
 * Server-only: reaches the law catalogue. Clients import the pure
 * `stanceForReserveLevel` instead.
 */
export async function resolveConscriptionStanceFor(
  db: Db,
  countryId: string
): Promise<ConscriptionStance> {
  const lawId =
    RESERVE_LAW_BY_COUNTRY[countryId] ??
    (await carriedLawIdFor(db, countryId, Object.values(RESERVE_LAW_BY_COUNTRY)));
  if (!lawId) return resolveConscriptionStance(countryId);
  const level = await getEnactedLevel(db, countryId as LawCountryId, lawId);
  return stanceForReserveLevel(level);
}
