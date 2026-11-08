/**
 * Command Economy (market-visibility gate): which countries' corporate markets
 * should NOT be offered to a PRIVATE corporation because the state owns
 * production there. Gated solely by the marketization dial
 * (`marketizationLevel`), read live from
 * `FederalBudget.economicFactors.marketizationLevel` with the era schedule as
 * fallback; below `COMMAND_CEILING` the market is state-controlled.
 *
 * Deliberately does NOT consult `commandEconomyEnabled`: that gates simulation
 * subsystems, not whether the regime is planned. A command economy's market is
 * closed to private entry regardless.
 *
 * Fails OPEN: a DB error degrades to "not blocked" rather than false-blocking
 * live markets. The creation-side gate in `privateEnterpriseGate` fails closed.
 */

import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { loadPrivateEnterpriseBlockedCountries } from "./privateEnterpriseGate";

/**
 * Resolve the set of `countryIds` (out of the ones passed in) whose corporate
 * market is currently state-controlled and should not be offered to private
 * corporations. Only returns countries actually passed in, so it stays cheap to
 * call with a handful of candidates from a suggestions/expansion query.
 */
export async function loadCommandEconomyBlockedCountries(
  db: Db,
  countryIds: Iterable<string | null | undefined>
): Promise<Set<CountryId>> {
  const requested = new Set<string>();
  for (const raw of countryIds) {
    if (raw) requested.add(raw);
  }
  if (requested.size === 0) return new Set<CountryId>();

  let blockedEverywhere: Set<CountryId>;
  try {
    blockedEverywhere = await loadPrivateEnterpriseBlockedCountries(db);
  } catch {
    // Fail-open: see the file docblock.
    return new Set<CountryId>();
  }

  const blocked = new Set<CountryId>();
  for (const id of requested) {
    if (blockedEverywhere.has(id as CountryId)) blocked.add(id as CountryId);
  }
  return blocked;
}
