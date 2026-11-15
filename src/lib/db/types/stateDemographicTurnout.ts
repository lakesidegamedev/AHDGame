import type { CountryId } from "../../constants/countries";

/**
 * Turnout modifiers keyed by demographic category then group ID, representing
 * percentage-point adjustments (-20 to +20) to baseline turnout. Applied by
 * GOTV spending and canvassing; decay 2% per turn with diminishing returns
 * near caps.
 *
 * Shape: Record<categoryId, Record<groupId, modifier>>
 */
export type DemographicModifiers = Record<string, Record<string, number>>;

/**
 * State/region-specific demographic turnout modifiers.
 *
 * One document exists per region (US: 51 state/DC docs; UK: 650 constituency docs).
 */
export interface StateDemographicTurnout {
  /** Region ID (e.g. "PA", "CA" for US; "E14000530" for UK constituency) */
  _id: string;
  countryId: CountryId;
  /** Turnout modifiers by demographic category and group */
  modifiers: DemographicModifiers;
  /** Faster-decaying turnout inputs for races opened with coalition campaigning. */
  campaignModifiers?: DemographicModifiers;
  /** Canvassing-only component for Demographics v2 participation receipts. */
  campaignContactModifiers?: DemographicModifiers;
  /** Timestamp of last decay application (decay runs each turn) */
  lastDecayApplied: Date;
  /** Timestamp of last modifier update (GOTV or canvassing) */
  lastUpdated: Date;
}
