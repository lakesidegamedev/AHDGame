/**
 * Country-agnostic cabinet *positions* barrel.
 *
 * Split out of `cabinetMechanics.ts` because the two halves have very different
 * audiences. A label lookup ("what is seat X called in country Y") needs only
 * the position definitions, which are ~18 KB of source. The mechanics half is
 * ~144 KB of per-country policy and only the cabinet office pages read it.
 *
 * Before the split every client component that imported `getOfficeLabel` (via
 * `lib/utils/politics`) pulled all six countries' mechanics into its bundle: a
 * 201 KB chunk (33.8 KB gzipped) on country and election pages. Consumers that
 * only need names should import from here.
 */
import type { CountryId } from "./countries";
import { UK_CABINET_POSITIONS } from "./ukCabinet";
import { JP_CABINET_POSITIONS } from "./jpCabinet";
import { IE_CABINET_POSITIONS } from "./ieCabinet";
import { DE_CABINET_POSITIONS } from "./deCabinet";
import { CN_CABINET_POSITIONS } from "./cnCabinet";
import { NG_CABINET_POSITIONS } from "./ngCabinet";
import { RU_CABINET_POSITIONS } from "./ruCabinet";
import { DD_CABINET_POSITIONS } from "./ddCabinet";
import {
  EASTERN_BLOC_GENERAL_SECRETARY_CABINET_POSITIONS,
  PL_CABINET_POSITIONS,
  YU_CABINET_POSITIONS,
  UNION_REPUBLIC_CABINET_POSITIONS,
} from "./easternBlocCabinet";
import { SCO_CABINET_POSITIONS } from "./scoCabinet";
import { WAL_CABINET_POSITIONS } from "./walCabinet";
import { CABINET_POSITIONS } from "./cabinet";
import { ECON_COUNTRY_CABINET_POSITIONS } from "./econCountryCabinet";

/** One era display-name band; the last band with `from <= year` wins. */
export interface CabinetNameBand {
  from: number;
  name: string;
}

/** Shape of a cabinet position definition shared across all country configs. */
export interface CabinetPositionDef {
  id: string;
  name: string;
  order: number;
  description?: string;
  /**
   * True for the head-of-government seat (e.g. CN Premier, IE Taoiseach). This
   * position is auto-assigned from `governmentFormations.pmCharacterId` (seated
   * via the Appoint-Premier flow), not the cabinet appointment flow — so it is
   * never appointable/fireable as a cabinet member.
   */
  isHeadOfGovernment?: boolean;
  /**
   * First in-game year this seat exists (live year, see rosterEra.ts).
   * PERPETUAL_YEAR (1775) = always existed. Data convention: EXPLICIT on every
   * seat (enforced by cabinetYearGating.test.ts); the resolver still defaults a
   * missing value to PERPETUAL_YEAR defensively.
   */
  yearEnabled?: number;
  /** Seat inactive from this year on. Active range: yearEnabled <= y < yearRetired. */
  yearRetired?: number;
  /**
   * Successor seat id (same country). When the live year crosses `yearRetired`,
   * the cabinetYearCrossing phase moves the incumbent to this seat. Requires
   * `yearRetired`.
   */
  succeededBy?: string;
  /** Era display names. Resolution: last band with from <= year; fallback `name`. */
  namesByYear?: ReadonlyArray<CabinetNameBand>;
  /**
   * Legislation-driven rename: when the seat named in `whenSeatEnabled` has been
   * brought into existence by a create_department bill (recorded in
   * `gameState.manuallyEnabledSeats`), this seat is styled `name`. Used for
   * HEW -> HHS when the Department of Education Act carves off Education.
   * Takes precedence over `namesByYear`. See rosterEra.resolveSeatName.
   */
  renameOnDepartmentSplit?: { whenSeatEnabled: string; name: string };
  /**
   * Seated by the executive alone: a nomination for this seat opens no Senate
   * vote and the nominee takes office at the next turn (US Chief of Staff).
   */
  appointedWithoutConfirmation?: boolean;
  /** Not part of the presidential line of succession, so no "Nth in line" label. */
  outsideSuccession?: boolean;
}

const POSITIONS_BY_COUNTRY: Record<string, ReadonlyArray<CabinetPositionDef>> = {
  UK: UK_CABINET_POSITIONS,
  US: CABINET_POSITIONS,
  JP: JP_CABINET_POSITIONS,
  IE: IE_CABINET_POSITIONS,
  DE: DE_CABINET_POSITIONS,
  CN: CN_CABINET_POSITIONS,
  NG: NG_CABINET_POSITIONS,
  RU: RU_CABINET_POSITIONS,
  DD: DD_CABINET_POSITIONS,
  PL: PL_CABINET_POSITIONS,
  CS: EASTERN_BLOC_GENERAL_SECRETARY_CABINET_POSITIONS,
  HU: EASTERN_BLOC_GENERAL_SECRETARY_CABINET_POSITIONS,
  RO: EASTERN_BLOC_GENERAL_SECRETARY_CABINET_POSITIONS,
  BG: EASTERN_BLOC_GENERAL_SECRETARY_CABINET_POSITIONS,
  YU: YU_CABINET_POSITIONS,
  UKR: UNION_REPUBLIC_CABINET_POSITIONS,
  BLR: UNION_REPUBLIC_CABINET_POSITIONS,
  BAL: UNION_REPUBLIC_CABINET_POSITIONS,
  SCO: SCO_CABINET_POSITIONS,
  WAL: WAL_CABINET_POSITIONS,
  FR: ECON_COUNTRY_CABINET_POSITIONS,
  IT: ECON_COUNTRY_CABINET_POSITIONS,
  ES: ECON_COUNTRY_CABINET_POSITIONS,
  SE: ECON_COUNTRY_CABINET_POSITIONS,
  TR: ECON_COUNTRY_CABINET_POSITIONS,
  AT: ECON_COUNTRY_CABINET_POSITIONS,
  FI: ECON_COUNTRY_CABINET_POSITIONS,
  GR: ECON_COUNTRY_CABINET_POSITIONS,
  BR: ECON_COUNTRY_CABINET_POSITIONS,
};

/** Get cabinet positions list for a country. */
export function getCabinetPositions(
  countryId: CountryId | string
): ReadonlyArray<CabinetPositionDef> {
  return POSITIONS_BY_COUNTRY[countryId] ?? [];
}

/**
 * True when the executive fills this seat alone, with no confirmation vote
 * (see CabinetPositionDef.appointedWithoutConfirmation).
 */
export function isDirectAppointmentSeat(
  countryId: CountryId | string,
  positionId: string
): boolean {
  return (
    getCabinetPositions(countryId).find((position) => position.id === positionId)
      ?.appointedWithoutConfirmation === true
  );
}

/** All country ids that have a cabinet roster registered. */
export function getCabinetCountryIds(): string[] {
  return Object.keys(POSITIONS_BY_COUNTRY);
}
