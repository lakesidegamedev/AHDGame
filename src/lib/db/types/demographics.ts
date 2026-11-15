import type { CountryId } from "../../constants/countries";

/**
 * Known US demographic category IDs. The type is widened to `string` to allow
 * country-specific categories (e.g. UK) without requiring this union to grow.
 */
export type DemographicCategoryId =
  "race" | "gender" | "education" | "wealth" | "age" | "ideology" | "voterGroups" | (string & {});

export interface DemographicGroup {
  id: string;
  name: string;
  defaultEconomicLean: number;
  defaultSocialLean: number;
  defaultTurnout?: number;
}

export interface DemographicCategory {
  _id: DemographicCategoryId;
  name: string;
  groups: DemographicGroup[];
  defaultWeight: number;
}

export interface StateDemographicGroup {
  population: number;
  economicLean: number;
  socialLean: number;
  /** Optional state-specific turnout (0-100). When set, overrides category default; derived from underlying group composition. */
  turnout?: number;
  nameRecognition?: number;
}

/** Category weights (sum to 100). For 12 archetypes, use { voterGroups: 100 }. */
export interface CategoryWeights {
  race?: number;
  gender?: number;
  education?: number;
  wealth?: number;
  age?: number;
  ideology?: number;
  voterGroups?: number;
  [key: string]: number | undefined;
}

/**
 * Durable per-(dimension, bucket) Layer-1 census-position deltas, keyed
 * `dim -> bucketKey -> delta`, additive on top of the static position tables
 * before granular-cell derivation (see `applyPositionOverlay`).
 *
 * The ONLY channel through which an era checkpoint reaches the granular vote
 * path: that substrate derives cell leans from static tables, not from
 * archetype leans, so a `groups[id]` shift is invisible to it.
 *
 * On `demographicDefaults` this is the DURABLE base (era-checkpoint turn and
 * `permanent: true` legislation), only growing, never decayed. On the LIVE
 * `stateDemographics` doc the same shape carries TEMPORARY drift of a
 * `{ dim, bucket }` legislation effect, banded around zero and decaying back,
 * folded onto unit leans AFTER derivation to avoid double-counting.
 */
export type Layer1PositionOverlay = Record<
  string,
  Record<string, { economicLean: number; socialLean: number }>
>;

/**
 * Durable per-(dimension, bucket) Layer-1 turnout-rate deltas in percentage
 * points, keyed `dim -> bucketKey -> delta`. Same shape as
 * {@link Layer1PositionOverlay} but NOT interchangeable: turnout is one plain
 * number per bucket, not a signed two-axis lean, and it is clamped to its own
 * signed percentage-point bound.
 *
 * This is the ONLY channel through which a durable turnout shift reaches the
 * vote path: both engines rebuild turnout from `DEMOGRAPHIC_TURNOUT_RATES`
 * baselines rather than `StateDemographicGroup.turnout`, so an archetype-level
 * write to `groups[id].turnout` is invisible to them for a Layer-1 US state.
 *
 * Written only on the `demographicDefaults` snapshot doc, and only grows.
 */
export type Layer1TurnoutOverlay = Record<string, Record<string, number>>;

export interface StateDemographics {
  _id: string;
  countryId: CountryId;
  categoryWeights: CategoryWeights;
  cachedEconomicLean?: number;
  cachedSocialLean?: number;
  lastUpdated: Date;
  /**
   * See {@link Layer1PositionOverlay}. Present on BOTH demographics docs, with
   * the same split the group leans already have: on a `demographicDefaults`
   * doc it is the DURABLE base (era checkpoints, `permanent: true` laws), read
   * as the derivation overlay; on a live `stateDemographics` doc it is the
   * TEMPORARY, banded, decaying drift a `{ dim, bucket }` legislation effect
   * has built up, folded onto unit leans after derivation. A bucket target has
   * no archetype group to carry that drift on, which is why it lives here.
   */
  layer1PositionOverrides?: Layer1PositionOverlay;
  /** See {@link Layer1TurnoutOverlay} and `layer1PositionOverrides` above — same two-doc split. */
  layer1TurnoutOverrides?: Layer1TurnoutOverlay;
  /**
   * Last newsroom slant pull applied to this state's electorate (see
   * `mediaEditorial/opinionPull.ts`). `turn` is the idempotency watermark;
   * `economic` and `social` are the per-turn steps just applied; `slant*` and
   * `strength` describe the local newsrooms. Live doc only.
   */
  mediaOpinionPull?: {
    turn: number;
    economic: number;
    social: number;
    slantEconomic?: number;
    slantSocial?: number;
    strength: number;
  };
}

/**
 * Group-shaped view of a region's census units, built by the census substrate
 * and the seed generators for the lean and weighting helpers. It is never
 * stored: persisted `stateDemographics` documents carry no group rows.
 */
export interface CensusGroupView extends StateDemographics {
  groups: Record<string, StateDemographicGroup>;
}
