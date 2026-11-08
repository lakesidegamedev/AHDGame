import type { CountryId } from "../../constants/countries";

/**
 * Per-geography PS pressure track. One row per `(countryId, partyId, stateId)`.
 *
 * Escalates by `PRESSURE_LADDER_INCREMENT` per PS spend in that geography,
 * decays by `PRESSURE_DECAY_PER_TURN` per turn (floored at `0`). Effective
 * cost is `baseCost + min(value, PRESSURE_LADDER_MAX_COST - baseCost)`.
 * Pressure is per-geography, so national and state-party actions share a row.
 */
export interface PartyStrengthPressure {
  _id: string;
  countryId: CountryId;
  partyId: string;
  stateId: string;
  /**
   * Current pressure value. Floored at `0`; capped indirectly because the
   * effective per-action cost saturates at `PRESSURE_LADDER_MAX_COST`.
   */
  value: number;
  lastUpdatedTurn: number;
}
