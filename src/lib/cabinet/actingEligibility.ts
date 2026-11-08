import {
  getCountryConfig,
  supportsActingAppointments,
  type CountryId,
} from "@/lib/constants/countries";

/**
 * Countries whose cabinet seats are filled by legislative confirmation, and so
 * have a confirmation gap an acting appointment can bridge.
 *
 * `supportsActingAppointments` is true for every presidential country, but BR
 * and FR define no cabinet positions at all, and NG fills its cabinet directly
 * (see the branch it takes in `clearCabinetOnTransition`). Only the US runs
 * confirmation, which `cabinetNominations` reflects by hardcoding its country.
 *
 * Kept here rather than in `countries.ts` because that file is already past the
 * architecture audit's size cap.
 */
const CONFIRMS_CABINET: ReadonlySet<CountryId> = new Set<CountryId>(["US"]);

/**
 * May this country's executive install acting cabinet members?
 *
 * Reads the STATIC country config. The runtime `countryState.governmentType`
 * is the eventual source of truth and this should move to it; until then the
 * two cannot disagree for any country in `CONFIRMS_CABINET`, since the only
 * regime transition rewrites a one-party state toward democracy.
 */
export function actingAppointmentsEnabled(countryId: CountryId): boolean {
  return supportsActingAppointments(getCountryConfig(countryId)) && CONFIRMS_CABINET.has(countryId);
}
