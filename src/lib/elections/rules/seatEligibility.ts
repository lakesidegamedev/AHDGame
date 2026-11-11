import { US_CONFIG } from "@/lib/countries/us/institutionsFacts";
import { MULTI_SEAT_TYPES } from "@/lib/utils/electionLabels";

/**
 * Multi-seat election eligibility. The US House gate scales with the size of
 * the state delegation, while other chambers keep their configured flat gate.
 * See getMultiSeatMinShare.
 */

const HOUSE_MIN_SHARE = 0.1;
const HOUSE_MAX_SHARE = 0.2;
export const STANDARD_MULTI_SEAT_MIN_SHARE = 0.1;

/**
 * Derive the US House party eligibility gate from the authoritative state
 * delegation size. Invalid or missing counts preserve the legacy 20% gate.
 */
export function getHouseSeatMinShare(authoritativeSeats?: number): number {
  if (
    authoritativeSeats == null ||
    !Number.isInteger(authoritativeSeats) ||
    authoritativeSeats <= 0
  ) {
    return HOUSE_MAX_SHARE;
  }

  return Math.min(HOUSE_MAX_SHARE, Math.max(HOUSE_MIN_SHARE, 1 / (authoritativeSeats + 1)));
}

/**
 * Minimum party-pooled vote share required to enter a multi-seat allocation.
 *
 * The country check is intentional: Nigeria also uses `house` for its House
 * of Representatives zone races, which retain the legacy 20% gate. Callers
 * without country context likewise stay on that compatible default.
 *
 * The other listed chambers use a flat 10% gate because their larger district
 * magnitudes or explicit multi-party design make the default 20% gate too
 * restrictive. Keep those established rules independent of the US formula.
 */
export function getMultiSeatMinShare(
  electionType: string,
  authoritativeSeats?: number,
  countryId?: string
): number {
  if (electionType === "house") {
    return countryId === US_CONFIG.id ? getHouseSeatMinShare(authoritativeSeats) : HOUSE_MAX_SHARE;
  }

  if (
    electionType === "stateSenate" ||
    electionType === "regionalCouncil" ||
    electionType === "landtag" ||
    electionType === "commons" ||
    electionType === "snap_commons" ||
    electionType === "shugiin" ||
    electionType === "snap_shugiin" ||
    electionType === "peoplesCongress" ||
    electionType === "dail" ||
    electionType === "seanad" ||
    electionType === "localCouncil" ||
    electionType === "assembleeNationale" ||
    electionType === "cameraDeputati" ||
    electionType === "congresoDiputados" ||
    electionType === "riksdag" ||
    electionType === "caCommons" ||
    electionType === "qcAssembly" ||
    electionType === "milletMeclisi" ||
    electionType === "nationalrat" ||
    electionType === "eduskunta" ||
    electionType === "vouli" ||
    electionType === "volkskammerDeputy" ||
    electionType === "landAssembly"
  ) {
    return STANDARD_MULTI_SEAT_MIN_SHARE;
  }

  // Standard gate for all other proportional chambers. The list above grew
  // one chamber per incident; anything missing fell through to 20%, which in a
  // multi-party system let the plurality party take every seat.
  if (MULTI_SEAT_TYPES.has(electionType)) return STANDARD_MULTI_SEAT_MIN_SHARE;

  return 0.2;
}
