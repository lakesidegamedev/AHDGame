/**
 * Country-agnostic cabinet mechanics barrel.
 * Routes to the correct per-country config by countryId.
 *
 * Position definitions live in `./cabinetPositions` and are re-exported here for
 * compatibility. The split matters for the client bundle: a label lookup only
 * needs the positions module, while this barrel carries every country's policy
 * mechanics (~144 KB of source) and should stay behind cabinet office pages.
 */
import type { CountryId } from "./countries";
import type { CabinetPositionMechanics } from "./cabinetMechanicsTypes";
import { UK_CABINET_MECHANICS } from "./ukCabinetMechanics";
import { US_CABINET_MECHANICS } from "./usCabinetMechanics";
import { JP_CABINET_MECHANICS } from "./jpCabinetMechanics";
import { IE_CABINET_MECHANICS } from "./ieCabinetMechanics";
import { DE_CABINET_MECHANICS } from "./deCabinetMechanics";
import { CN_CABINET_MECHANICS } from "./cnCabinetMechanics";
import { NG_CABINET_MECHANICS } from "./ngCabinetMechanics";
import { RU_CABINET_MECHANICS } from "./ruCabinetMechanics";
import { DD_CABINET_MECHANICS } from "./ddCabinetMechanics";
import {
  EASTERN_BLOC_GENERAL_SECRETARY_CABINET_MECHANICS,
  PL_CABINET_MECHANICS,
  YU_CABINET_MECHANICS,
  UNION_REPUBLIC_CABINET_MECHANICS,
} from "./easternBlocCabinet";
import { SCO_CABINET_MECHANICS } from "./scoCabinet";
import { WAL_CABINET_MECHANICS } from "./walCabinet";
import { ECON_COUNTRY_CABINET_MECHANICS } from "./econCountryCabinet";

export type { CabinetPositionMechanics } from "./cabinetMechanicsTypes";
export type { CabinetNameBand, CabinetPositionDef } from "./cabinetPositions";
export {
  getCabinetPositions,
  isDirectAppointmentSeat,
  getCabinetCountryIds,
} from "./cabinetPositions";

export const MECHANICS_BY_COUNTRY: Record<string, Record<string, CabinetPositionMechanics>> = {
  UK: UK_CABINET_MECHANICS,
  US: US_CABINET_MECHANICS,
  JP: JP_CABINET_MECHANICS,
  IE: IE_CABINET_MECHANICS,
  DE: DE_CABINET_MECHANICS,
  CN: CN_CABINET_MECHANICS,
  NG: NG_CABINET_MECHANICS,
  RU: RU_CABINET_MECHANICS,
  DD: DD_CABINET_MECHANICS,
  // Eastern bloc Tier-1 — DD/RU Council of Ministers shape (1953 promotion).
  PL: PL_CABINET_MECHANICS,
  CS: EASTERN_BLOC_GENERAL_SECRETARY_CABINET_MECHANICS,
  HU: EASTERN_BLOC_GENERAL_SECRETARY_CABINET_MECHANICS,
  RO: EASTERN_BLOC_GENERAL_SECRETARY_CABINET_MECHANICS,
  BG: EASTERN_BLOC_GENERAL_SECRETARY_CABINET_MECHANICS,
  YU: YU_CABINET_MECHANICS,
  // Union republics — republican First Secretary heads the council (PL shape).
  UKR: UNION_REPUBLIC_CABINET_MECHANICS,
  BLR: UNION_REPUBLIC_CABINET_MECHANICS,
  BAL: UNION_REPUBLIC_CABINET_MECHANICS,
  SCO: SCO_CABINET_MECHANICS,
  WAL: WAL_CABINET_MECHANICS,
  FR: ECON_COUNTRY_CABINET_MECHANICS,
  IT: ECON_COUNTRY_CABINET_MECHANICS,
  ES: ECON_COUNTRY_CABINET_MECHANICS,
  SE: ECON_COUNTRY_CABINET_MECHANICS,
  TR: ECON_COUNTRY_CABINET_MECHANICS,
  AT: ECON_COUNTRY_CABINET_MECHANICS,
  FI: ECON_COUNTRY_CABINET_MECHANICS,
  GR: ECON_COUNTRY_CABINET_MECHANICS,
  BR: ECON_COUNTRY_CABINET_MECHANICS,
};

/** Get mechanics for a specific position in a country. Returns undefined if not found. */
export function getCabinetMechanics(
  countryId: CountryId | string,
  positionId: string
): CabinetPositionMechanics | undefined {
  return MECHANICS_BY_COUNTRY[countryId]?.[positionId];
}

/** Get all mechanics for a country. Returns empty object if country has none. */
export function getAllCabinetMechanics(
  countryId: CountryId | string
): Record<string, CabinetPositionMechanics> {
  return MECHANICS_BY_COUNTRY[countryId] ?? {};
}

export { getCabinetPositionGroup, type CabinetGroup } from "./cabinetPositionGroups";
