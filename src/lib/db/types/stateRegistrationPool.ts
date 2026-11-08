import type { CountryId } from "../../constants/countries";

/**
 * State-level non-party registration buckets.
 *
 * Invariant: in each state, sum of StatePartyOrg.registration[partyId] for
 * parties in the country + independent + unregistered = 100.
 *
 * Drift, decay, and Reg actions mutate `independent` and `unregistered` per the
 * politics turn-order contract.
 *
 * See docs/design/political-system-reg-support.md §4.3 for the full model.
 */
export interface StateRegistrationPool {
  /** Composite key: `${countryId}_${stateId}` (mirrors StatePartyOrg pattern). */
  _id: string;

  countryId: CountryId;
  stateId: string;

  /**
   * Politically engaged but unattached share. Moved primarily by persuasion,
   * candidate quality, scandals, endorsements, and issue salience.
   * Bounds: 0..100.
   */
  independent: number;

  /**
   * Lower-engagement population share. Primarily moved by registration /
   * civic-engagement actions.
   * Bounds: 0..100.
   */
  unregistered: number;

  /**
   * Last turn at which any share moved (matches `gameState.currentTurn`
   * semantics). Useful for change detection and for skipping renormalization
   * scans on quiet states.
   */
  lastUpdatedTurn: number;

  createdAt: Date;
  updatedAt: Date;
}
