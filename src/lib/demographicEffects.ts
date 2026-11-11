/**
 * Demographic Effects Processing Module
 *
 * Processes how policies shift the electorate over time. Effects are authored
 * on `LegislationType.demographicEffects[]` as `{ dim, bucket }` census
 * targets and drive the "legislation → demographics → elections" link: a
 * pro-labour law pulls the low-wealth bucket's economic lean toward the law's
 * direction and nudges its turnout up.
 *
 * KEY DESIGN DECISIONS:
 *
 * 1. Drift lives on the Layer-1 overlays of the live demographics document
 *    (`layer1PositionOverrides`, `layer1TurnoutOverrides`), a signed deviation
 *    per `dim:bucket`. The granular substrate folds it onto unit leans and
 *    turnouts, so the vote path, polls and the cached lean all read one
 *    electorate.
 *
 * 2. Cumulative shifts: Each policy contributes additive shifts to specific
 *    buckets. Multiple policies affecting the same bucket stack.
 *
 * 3. Federal effect division: Federal policies apply at 1/50 strength per US state
 *    and 1/12 strength per UK region. This prevents a single national bill from
 *    dominating region-level demographics and ensures the sum of per-region
 *    effects roughly equals the intended national total.
 *
 * 4. Policy strength normalization: Policy economic/social scores (-3 to +3)
 *    are normalized to -1 to +1 range before applying shifts. This creates
 *    a consistent scale across all legislation types. (Some seed options score
 *    up to ±5, i.e. strength up to ±1.67, shared by all channels.)
 *
 * 5. Natural decay: a deviation decays proportionally toward zero at
 *    0.25%/turn whenever no active law targets that bucket and axis, so drift
 *    reverts after legislation is repealed.
 */

import type { Db } from "mongodb";
import type { StateDemographics } from "@/lib/db/types/demographics";
import type {
  DemographicEffect,
  DemographicEffectTarget,
  LegislationType,
} from "@/lib/db/types/legislation";
import type { GameState } from "@/lib/db/types/gameState";
import type { State } from "@/lib/db/types/state";
import { getFederalMultiplier } from "@shared/constants/formulas";
import {
  censusCachedStateLean,
  type CachedStateLeanContext,
} from "@/lib/demographics/cachedStateLean";
import { censusBucketKeys } from "@/lib/demographics/censusBucketKeys";
import {
  loadAllStateSlants,
  mediaPullForState,
  type MediaPull,
} from "@/lib/mediaEditorial/opinionPull";
import type { StateSlant } from "@/lib/mediaEditorial/slant";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { isBucketTarget } from "@/lib/demographics/turnoutTarget";
import {
  applyDurableBucketShift,
  applyDurableBucketTurnoutShift,
  readLayer1Overlay,
  readLayer1TurnoutOverlay,
  type DurableShiftAccumulators,
} from "@/lib/demographics/durableRealignment";
import type { ActivePolicy, LegislationTypeMap } from "./policyEffects";
import type { ResetLawProgramDocument } from "@/lib/resetLegislation/program";
import { regionalFamilyLeanPolicies } from "@/lib/resetLegislation/familyLeanEffects";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";
import { statePoliciesCollection } from "@/lib/db/repositories/statePolicies";
import { demographicDefaultsCollection } from "@/lib/db/repositories/demographicDefaults";

/**
 * Lean shift per turn at maximum policy strength (magnitude 1, state scope).
 * Leans live on the shared −5..+5 axis, so the axis range is 10 units and 10%
 * of the range is 1.0 lean. At 0.035/turn a max-strength (±3 ⇒ strength 1.0)
 * state law moves a bucket's lean by 1.0 in ~29 turns (~0.6 game years),
 * inside the intended 20-40 turn window; the strongest ±5 seed options
 * (strength 1.67) reach it in ~17 turns.
 */
export const LEAN_SHIFT_RATE_PER_TURN = 0.035;

/**
 * Maximum cumulative lean deviation legislation may build up on a bucket:
 * 1.5 lean = 15% of the 10-unit axis. A value already outside the band is
 * never snapped inward; the band only stops legislation pushing further out.
 */
export const LEAN_MAX_DEVIATION_FROM_BASELINE = 1.5;

/**
 * Turnout shift per turn at maximum policy strength (magnitude 1, state
 * scope), in percentage points on the 0-100 turnout scale. 0.25/turn ⇒ a
 * max-strength law needs 40 turns to move a bucket's turnout by 10 points.
 * Deliberately reaches its own (tighter) deviation cap at the slow end of the
 * 20-40-turn lean window: real-world mobilization laws move turnout by a few
 * points, not tens.
 */
export const TURNOUT_SHIFT_RATE_PER_TURN = 0.25;

/**
 * Maximum cumulative turnout deviation legislation may build up on a bucket:
 * 10 percentage points (10% of the 0-100 range, tighter than the lean band).
 */
export const TURNOUT_MAX_DEVIATION_FROM_BASELINE = 10;

/**
 * Proportional decay per turn of a bucket's lean/turnout deviation back toward
 * zero when NO active law targets that bucket and axis. Matches the 0.25%/turn
 * natural metric decay (src/lib/turn/metricDecay.ts DECAY_RATE) so legislative
 * drift reverts on the same timescale metrics do (~19 game years for 90%
 * reversion).
 */
export const LEAN_TURNOUT_DECAY_RATE_PER_TURN = 0.0025;

/** Bounds for DemographicEffect.magnitude — seed typos cannot create runaway shifts. */
export const DEMOGRAPHIC_EFFECT_MAGNITUDE_MIN = 0.25;
export const DEMOGRAPHIC_EFFECT_MAGNITUDE_MAX = 3;

/** Absolute bounds of the lean axis (shared −5..+5 ruler). */
const LEAN_ABS_MIN = -5;
const LEAN_ABS_MAX = 5;

/** Skip very small changes (floating point churn guard, shared by all channels). */
const MIN_CHANGE_THRESHOLD = 0.0001;

/** Clamp an effect's magnitude to [0.25, 3]; absent = 1. */
export function clampDemographicEffectMagnitude(magnitude: number | undefined): number {
  if (typeof magnitude !== "number" || !Number.isFinite(magnitude)) return 1;
  return Math.max(
    DEMOGRAPHIC_EFFECT_MAGNITUDE_MIN,
    Math.min(DEMOGRAPHIC_EFFECT_MAGNITUDE_MAX, magnitude)
  );
}

/**
 * The key a demographic effect accumulates under, or null when it names
 * nothing this engine can move.
 *
 * A `{ dim, bucket }` effect keys as `"dim:bucket"`, the same `"dim:key"`
 * form the cell `bucketWeights`, the GOTV modifiers and the Layer-1 overlays
 * all use. Returns null for a population effect (a bucket's population is the
 * region's raked census marginal, not a legislative lever, see
 * `DemographicEffect`'s doc comment) and for a stored effect that still names
 * only a voter group, which has no census bucket to move.
 */
export function demographicEffectTargetKey(effect: DemographicEffect): string | null {
  if (!effect.dim || !effect.bucket) return null;
  if ((effect.target ?? "population") === "population") return null;
  return `${effect.dim}:${effect.bucket}`;
}

/** Split a `"dim:bucket"` key. Null when the key has no bucket form. */
function splitBucketKey(key: string): { dim: string; bucket: string } | null {
  if (!isBucketTarget(key)) return null;
  const sep = key.indexOf(":");
  return { dim: key.slice(0, sep), bucket: key.slice(sep + 1) };
}

/** Per-target accumulated shifts: target key → per-turn delta. */
export interface DemographicShiftSet {
  /** `calculateDemographicShiftsByTarget` includes EVERY effect (permanent or not); `subtractDurableShifts` narrows it to the temporary-only rate `buildDemographicUpdates` consumes. */
  economicLean: Record<string, number>;
  socialLean: Record<string, number>;
  turnout: Record<string, number>;
}

const SHIFT_RATE_BY_TARGET: Record<Exclude<DemographicEffectTarget, "population">, number> = {
  economicLean: LEAN_SHIFT_RATE_PER_TURN,
  socialLean: LEAN_SHIFT_RATE_PER_TURN,
  turnout: TURNOUT_SHIFT_RATE_PER_TURN,
};

/**
 * Shared per-turn shift-rate computation, filtered by an effect predicate.
 * `calculateDemographicShiftsByTarget` (all effects) and
 * `calculateDurableDemographicShiftsByTarget` (`permanent: true` effects
 * only) are both thin wrappers over this — same formula, different subset.
 */
function computeShiftsByTarget(
  policies: ActivePolicy[],
  legTypeMap: LegislationTypeMap,
  include: (effect: DemographicEffect) => boolean
): DemographicShiftSet {
  const shifts: DemographicShiftSet = {
    economicLean: {},
    socialLean: {},
    turnout: {},
  };

  for (const policy of policies) {
    const legType = legTypeMap.get(policy.legislationTypeId);

    if (!legType?.demographicEffects || legType.demographicEffects.length === 0) {
      continue;
    }

    for (const effect of legType.demographicEffects) {
      if (!include(effect)) continue;
      const key = demographicEffectTargetKey(effect);
      if (!key) continue;
      const target = effect.target as Exclude<DemographicEffectTarget, "population">;
      // Normalize policy strength to -1 to +1 range (score ranges -3 to +3;
      // seeds use up to ±5). Economic score unless the effect opts into social.
      const strength =
        (effect.strengthAxis === "social" ? (policy.social ?? 0) : policy.economic) / 3;
      // Calculate shift amount:
      // - effect.direction: base rate of change (-1 to +1)
      // - strength: normalized policy strength (same scaling for every target)
      // - scopeMultiplier: 1.0 for state, 1/N for federal/national
      // - rate: per-target maximum shift per turn
      // - magnitude: optional per-effect multiplier, clamped to [0.25, 3].
      const magnitude = clampDemographicEffectMagnitude(effect.magnitude);
      const shiftAmount =
        effect.direction *
        strength *
        policy.scopeMultiplier *
        SHIFT_RATE_BY_TARGET[target] *
        magnitude;

      const channel = shifts[target];
      channel[key] = (channel[key] ?? 0) + shiftAmount;
    }
  }

  return shifts;
}

/**
 * Calculate cumulative demographic shifts from all active policies, routed by
 * effect target. Includes EVERY effect regardless of `permanent` — this is also what
 * `eraCheckpointTurn.ts`'s counter-pressure netting reads, and a durable
 * ("permanent") law's ongoing per-turn pull should count as counter-pressure
 * against an era checkpoint (or vice versa) exactly like an ordinary one
 * does; `calculateDurableDemographicShiftsByTarget` below is the narrower
 * view that routes the durable subset to the non-decaying channel.
 * @param policies - Array of active policies with scope multipliers
 * @param legTypeMap - Pre-fetched map of legislation type IDs to documents
 */
export function calculateDemographicShiftsByTarget(
  policies: ActivePolicy[],
  legTypeMap: LegislationTypeMap
): DemographicShiftSet {
  return computeShiftsByTarget(policies, legTypeMap, () => true);
}

/**
 * Same computation, restricted to `permanent: true` lean/turnout effects —
 * the per-turn rate that durably relocates a bucket's base value (see
 * `DemographicEffect.permanent`'s doc comment and
 * `src/lib/demographics/durableRealignment.ts`) rather than applying a
 * capped, decaying overlay. `turnout` is included: the Voting Rights Act's
 * enfranchisement effect is a durable TURNOUT shift, not a lean one, and
 * routes through `applyDurableBucketTurnoutShift`'s dedicated turnout-rate
 * overlay (`layer1TurnoutOverrides`), not the lean channel's
 * `layer1PositionOverrides`.
 */
export function calculateDurableDemographicShiftsByTarget(
  policies: ActivePolicy[],
  legTypeMap: LegislationTypeMap
): DemographicShiftSet {
  return computeShiftsByTarget(
    policies,
    legTypeMap,
    (effect) =>
      effect.permanent === true &&
      (effect.target === "economicLean" ||
        effect.target === "socialLean" ||
        effect.target === "turnout")
  );
}

/**
 * Subtract a durable shift set (already counted once in `total`) out of the
 * total, per bucket+axis, leaving the TEMPORARY-only rate that should still
 * go through the capped/decaying channel (`buildDemographicUpdates`).
 */
export function subtractDurableShifts(
  total: DemographicShiftSet,
  durable: DemographicShiftSet
): DemographicShiftSet {
  const subtractChannel = (
    t: Record<string, number>,
    d: Record<string, number>
  ): Record<string, number> => {
    if (Object.keys(d).length === 0) return t;
    const out: Record<string, number> = { ...t };
    for (const [key, value] of Object.entries(d)) {
      out[key] = (out[key] ?? 0) - value;
    }
    return out;
  };
  return {
    economicLean: subtractChannel(total.economicLean, durable.economicLean),
    socialLean: subtractChannel(total.socialLean, durable.socialLean),
    turnout: subtractChannel(total.turnout, durable.turnout),
  };
}

/**
 * Apply one turn of legislative shift to a lean/turnout value.
 *
 * The deviation band is one-directional: legislation can never push the value
 * further than ±maxDeviation from baseline, but a value already outside the
 * band (admin edit) is not snapped inward — it simply cannot move further
 * out, and shifts back toward the band always apply.
 */
export function applyBandedShift(
  current: number,
  baseline: number,
  shift: number,
  maxDeviation: number,
  absMin: number,
  absMax: number
): number {
  let next = current + shift;
  if (shift > 0) {
    next = Math.min(next, Math.max(baseline + maxDeviation, current));
  } else if (shift < 0) {
    next = Math.max(next, Math.min(baseline - maxDeviation, current));
  }
  return Math.max(absMin, Math.min(absMax, next));
}

/**
 * One turn of proportional decay toward baseline (0.25% of remaining distance,
 * mirroring src/lib/turn/metricDecay.ts). Below the change threshold the value
 * is returned unchanged so no write is emitted.
 */
export function applyBaselineDecay(current: number, baseline: number): number {
  const distance = current - baseline;
  if (Math.abs(distance) < MIN_CHANGE_THRESHOLD) return current;
  return current - distance * LEAN_TURNOUT_DECAY_RATE_PER_TURN;
}

/**
 * Build the `$set` field updates for one state's live demographics doc from a
 * shift set: the Layer-1 overlay drift for bucket-targeted laws, plus the
 * newsroom pull spread over `pullBuckets` when one applies.
 */
export function buildDemographicUpdates(
  demographics: StateDemographics,
  shifts: DemographicShiftSet,
  mediaPull: MediaPull | null = null,
  pullBuckets: readonly string[] = []
): Record<string, number> {
  const updates: Record<string, number> = {};
  addBucketDriftUpdates(demographics, shifts, updates);
  if (mediaPull) addMediaPullUpdates(demographics, mediaPull, pullBuckets, updates);
  return updates;
}

/**
 * Newsroom slant channel. The same step is added to every bucket of one census
 * dimension on an axis. Each unit's weights over a dimension sum to one, so
 * that moves the electorate-weighted state lean by exactly the step. It rides
 * on top of whatever the legislation channel or decay already wrote this turn,
 * so those forces are untouched. See `mediaEditorial/opinionPull.ts` for the
 * size and bounds of the step.
 */
function addMediaPullUpdates(
  demographics: StateDemographics,
  pull: MediaPull,
  buckets: readonly string[],
  updates: Record<string, number>
): void {
  const axes = [
    { axis: "economicLean" as const, step: pull.economic },
    { axis: "socialLean" as const, step: pull.social },
  ];
  for (const key of buckets) {
    const parts = splitBucketKey(key);
    if (!parts) continue;
    for (const { axis, step } of axes) {
      if (step === 0) continue;
      const path = `layer1PositionOverrides.${parts.dim}.${parts.bucket}.${axis}`;
      const current =
        updates[path] ??
        demographics.layer1PositionOverrides?.[parts.dim]?.[parts.bucket]?.[axis] ??
        0;
      updates[path] = Math.max(LEAN_ABS_MIN, Math.min(LEAN_ABS_MAX, current + step));
    }
  }
}

/**
 * Temporary lean/turnout drift for `{ dim, bucket }` effects.
 *
 * The drift is stored directly on the live doc, in the same overlay shape the
 * DURABLE channel writes to `demographicDefaults`: the defaults doc holds the
 * base, the live doc holds what legislation has moved it to.
 * `buildGranularElectorateSubstrate` folds the live doc's overlay onto unit
 * leans and turnouts.
 *
 * Baseline is 0: this overlay IS the deviation, so the deviation band and the
 * decay both measure from zero and a fully decayed law leaves no residue.
 */
function addBucketDriftUpdates(
  demographics: StateDemographics,
  shifts: DemographicShiftSet,
  updates: Record<string, number>
): void {
  const leanAxes = [
    { axis: "economicLean" as const, shifts: shifts.economicLean },
    { axis: "socialLean" as const, shifts: shifts.socialLean },
  ];

  for (const { axis, shifts: axisShifts } of leanAxes) {
    const stored = demographics.layer1PositionOverrides ?? {};
    const keys = new Set(Object.keys(axisShifts).filter(isBucketTarget));
    for (const [dim, byBucket] of Object.entries(stored)) {
      for (const bucket of Object.keys(byBucket)) keys.add(`${dim}:${bucket}`);
    }
    for (const key of keys) {
      const parts = splitBucketKey(key);
      if (!parts) continue;
      const current = stored[parts.dim]?.[parts.bucket]?.[axis] ?? 0;
      const shift = axisShifts[key];
      const next =
        typeof shift === "number" && shift !== 0
          ? applyBandedShift(
              current,
              0,
              shift,
              LEAN_MAX_DEVIATION_FROM_BASELINE,
              LEAN_ABS_MIN,
              LEAN_ABS_MAX
            )
          : applyBaselineDecay(current, 0);
      if (Math.abs(next - current) > MIN_CHANGE_THRESHOLD) {
        updates[`layer1PositionOverrides.${parts.dim}.${parts.bucket}.${axis}`] = next;
      }
    }
  }

  const storedTurnout = demographics.layer1TurnoutOverrides ?? {};
  const turnoutKeys = new Set(Object.keys(shifts.turnout).filter(isBucketTarget));
  for (const [dim, byBucket] of Object.entries(storedTurnout)) {
    for (const bucket of Object.keys(byBucket)) turnoutKeys.add(`${dim}:${bucket}`);
  }
  for (const key of turnoutKeys) {
    const parts = splitBucketKey(key);
    if (!parts) continue;
    const current = storedTurnout[parts.dim]?.[parts.bucket] ?? 0;
    const shift = shifts.turnout[key];
    // Drift is a signed delta on the turnout rate, so its absolute bounds are
    // the deviation band itself, not the 0-100 rate scale the band sits on.
    const next =
      typeof shift === "number" && shift !== 0
        ? applyBandedShift(
            current,
            0,
            shift,
            TURNOUT_MAX_DEVIATION_FROM_BASELINE,
            -TURNOUT_MAX_DEVIATION_FROM_BASELINE,
            TURNOUT_MAX_DEVIATION_FROM_BASELINE
          )
        : applyBaselineDecay(current, 0);
    if (Math.abs(next - current) > MIN_CHANGE_THRESHOLD) {
      updates[`layer1TurnoutOverrides.${parts.dim}.${parts.bucket}`] = next;
    }
  }
}

/**
 * Clone a demographics doc and apply this turn's dot-path updates in memory
 * (the two Layer-1 overlay paths), so the cached-lean recompute below sees a
 * law's effect in the same turn it is written rather than one turn late.
 */
function cloneWithUpdates(
  demographics: StateDemographics,
  updates: Record<string, number>
): StateDemographics {
  const clone: StateDemographics = {
    ...demographics,
    layer1PositionOverrides: structuredClone(demographics.layer1PositionOverrides ?? {}),
    layer1TurnoutOverrides: structuredClone(demographics.layer1TurnoutOverrides ?? {}),
  };
  for (const [path, value] of Object.entries(updates)) {
    const parts = path.split(".");
    if (parts.length === 4 && parts[0] === "layer1PositionOverrides") {
      const [, dim, bucket, axis] = parts;
      const overlay = (clone.layer1PositionOverrides ??= {});
      const byBucket = (overlay[dim] ??= {});
      const entry = (byBucket[bucket] ??= { economicLean: 0, socialLean: 0 });
      (entry as unknown as Record<string, number>)[axis] = value;
    } else if (parts.length === 3 && parts[0] === "layer1TurnoutOverrides") {
      const [, dim, bucket] = parts;
      const overlay = (clone.layer1TurnoutOverrides ??= {});
      (overlay[dim] ??= {})[bucket] = value;
    }
  }
  return clone;
}

/**
 * Recompute the cached derived leans after this turn's updates: the census
 * electorate lean over the updated doc, cached onto both `stateDemographics`
 * and `states`. Returns null when the cache is already consistent or the
 * region has no census to read a lean from.
 */
function computeCacheUpdate(
  demographics: StateDemographics,
  updates: Record<string, number>,
  context: CachedStateLeanContext
): { economicLean: number; socialLean: number } | null {
  const updated = cloneWithUpdates(demographics, updates);
  const lean = censusCachedStateLean(updated, context);
  if (!lean) return null;
  if (
    demographics.cachedEconomicLean === lean.economicLean &&
    demographics.cachedSocialLean === lean.socialLean
  ) {
    return null;
  }
  return lean;
}

/**
 * Process demographic effects for all states
 * @param db - MongoDB database instance
 * @returns number of states whose demographics were updated
 */
export async function processAllStateDemographics(
  db: Db,
  knownLegislationTypes?: readonly LegislationType[],
  /** Current turn; makes the newsroom slant pull apply at most once per turn. */
  turn?: number
): Promise<number> {
  // Bulk-fetch ALL data upfront in parallel (eliminates per-state queries)
  const [states, allStatePolicies, allLegTypes, allDemographics, gameState] = await Promise.all([
    statesCollection(db)
      .find({}, { projection: { _id: 1, countryId: 1 } })
      .toArray(),
    statePoliciesCollection<import("@/lib/db/types/statePolicy").StatePolicy>(db)
      .find({})
      .toArray(),
    knownLegislationTypes
      ? Promise.resolve(knownLegislationTypes)
      : legislationTypesCollection(db).find({}).toArray(),
    stateDemographicsCollection(db).find({}).toArray(),
    gameStateCollection(db).findOne(
      { _id: "current" },
      {
        projection: {
          preset: 1,
          currentYear: 1,
          startingYear: 1,
          resetWorldId: 1,
        },
      }
    ),
  ]);

  // The per-state seeded defaults carry the durable overlays the census reads.
  const allDefaults = await demographicDefaultsCollection(db).find({}).toArray();
  const defaultsByState = new Map(allDefaults.map((d) => [String(d._id), d]));
  // Newsroom slant: two batched reads for every state, only with the media
  // editorial flag on. Flag-off turns issue nothing extra.
  let slantByState = new Map<string, StateSlant>();
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { mediaEditorialEnabled: 1 } }
  );
  if (config?.mediaEditorialEnabled === true) slantByState = await loadAllStateSlants(db);

  // Build legislation type map for O(1) lookups
  const legTypeMap: LegislationTypeMap = new Map();
  for (const legType of allLegTypes) {
    legTypeMap.set(legType._id, legType);
  }

  // Enacted regional reset-law programs push their region's lean like state
  // policies do. One bulk read, only in a reset world.
  let regionalFamilyPolicies = new Map<string, ActivePolicy[]>();
  if (gameState?.resetWorldId) {
    const programs = await db
      .collection<ResetLawProgramDocument>("resetLawPrograms")
      .find(
        { worldId: gameState.resetWorldId, scope: "regional" },
        { projection: { regionId: 1, familyId: 1, choice: 1, scope: 1 } }
      )
      .toArray();
    const { policiesByRegion, types } = regionalFamilyLeanPolicies(programs);
    regionalFamilyPolicies = policiesByRegion;
    for (const [id, type] of types) legTypeMap.set(id, type);
  }

  // Group policies by stateId
  const policiesByState = new Map<string, import("@/lib/db/types/statePolicy").StatePolicy[]>();
  for (const policy of allStatePolicies) {
    const list = policiesByState.get(policy.stateId) ?? [];
    list.push(policy);
    policiesByState.set(policy.stateId, list);
  }

  // Build federal/UK national policies with country-aware scope multipliers.
  // US uses 1/50 and UK uses 1/12 so that the sum of per-region effects equals
  // the intended national total regardless of region count.
  const federalPolicies: ActivePolicy[] = (policiesByState.get("federal") ?? []).map((p) => ({
    ...p,
    scopeMultiplier: getFederalMultiplier("US"),
  }));
  const ukNationalPolicies: ActivePolicy[] = (policiesByState.get("uk_national") ?? []).map(
    (p) => ({ ...p, scopeMultiplier: getFederalMultiplier("UK") })
  );
  const jpNationalPolicies: ActivePolicy[] = (policiesByState.get("jp_national") ?? []).map(
    (p) => ({ ...p, scopeMultiplier: getFederalMultiplier("JP") })
  );
  const deNationalPolicies: ActivePolicy[] = (policiesByState.get("de_national") ?? []).map(
    (p) => ({ ...p, scopeMultiplier: getFederalMultiplier("DE") })
  );

  // Build demographics lookup
  const demographicsMap = new Map(allDemographics.map((d) => [String(d._id), d]));

  // Process all states in-memory, collect DB updates
  const bulkOps: {
    updateOne: {
      filter: { _id: string };
      update: { $set: Record<string, number | Date> };
    };
  }[] = [];
  const stateCacheOps: {
    updateOne: {
      filter: { _id: string };
      update: { $set: Record<string, number | Date> };
    };
  }[] = [];
  // Durable ("permanent") legislation writes to `demographicDefaults` too —
  // see `DemographicEffect.permanent` and `durableRealignment.ts`.
  const defaultBulkOps: {
    updateOne: {
      filter: { _id: string };
      update: { $set: Record<string, number | Date> };
    };
  }[] = [];

  for (const state of states) {
    // Build combined policies for this state
    const nationalPoliciesMap: Record<string, ActivePolicy[]> = {
      US: federalPolicies,
      UK: ukNationalPolicies,
      JP: jpNationalPolicies,
      DE: deNationalPolicies,
    };
    const nationalPolicies = nationalPoliciesMap[state.countryId] ?? federalPolicies;
    const statePoliciesArray = policiesByState.get(state._id) ?? [];
    const stateWithMultiplier: ActivePolicy[] = statePoliciesArray.map((p) => ({
      ...p,
      scopeMultiplier: 1.0,
    }));
    const policies = [
      ...stateWithMultiplier,
      ...(regionalFamilyPolicies.get(state._id) ?? []),
      ...nationalPolicies,
    ];

    // Policy-less states still decay toward baseline, so there is no fast path.
    const demographics = demographicsMap.get(state._id);
    if (!demographics) continue;

    // Calculate cumulative shifts from all policies. `shifts` (ALL effects)
    // still drives era-checkpoint counter-pressure elsewhere; the durable
    // ("permanent") subset is pulled out here so it stops going through the
    // capped/decaying temporary channel below and instead durably relocates
    // the base value via the shared mechanism (see `durableRealignment.ts`).
    const shifts = calculateDemographicShiftsByTarget(policies, legTypeMap);
    const durableShifts = calculateDurableDemographicShiftsByTarget(policies, legTypeMap);
    const temporaryShifts = subtractDurableShifts(shifts, durableShifts);

    const stateDefaults = defaultsByState.get(state._id);
    const leanContext = {
      countryId: demographics.countryId,
      stateId: demographics._id,
      preset: gameState?.preset,
      demographicDefaults: stateDefaults,
      year: gameState ? gameState.currentYear : null,
      startingYear: gameState?.startingYear,
    };

    // Newsroom slant pull: once per state per turn (watermarked), measured
    // from the state's current cached lean. A region without a census has no
    // electorate to pull.
    const slant = slantByState.get(state._id) ?? null;
    const alreadyPulled =
      typeof turn === "number" && (demographics.mediaOpinionPull?.turn ?? -1) >= turn;
    let mediaPull: MediaPull | null = null;
    let pullBuckets: string[] = [];
    if (slant && !alreadyPulled) {
      const calc =
        typeof demographics.cachedEconomicLean === "number" &&
        typeof demographics.cachedSocialLean === "number"
          ? {
              economicLean: demographics.cachedEconomicLean,
              socialLean: demographics.cachedSocialLean,
            }
          : censusCachedStateLean(demographics, leanContext);
      pullBuckets = censusBucketKeys(leanContext);
      if (calc && pullBuckets.length > 0) {
        mediaPull = mediaPullForState(
          { economic: calc.economicLean, social: calc.socialLean },
          slant
        );
      }
    }

    const temporaryUpdates = buildDemographicUpdates(
      demographics,
      temporaryShifts,
      mediaPull,
      pullBuckets
    );
    // Record what the newsrooms are doing so the state page can say so. Only
    // written when it changes or a pull is applied, and only for slanted states
    // (or to zero out a stale record).
    if (typeof turn === "number" && !alreadyPulled) {
      const stored = demographics.mediaOpinionPull;
      if (slant) {
        temporaryUpdates["mediaOpinionPull.turn"] = turn;
        temporaryUpdates["mediaOpinionPull.economic"] = mediaPull?.economic ?? 0;
        temporaryUpdates["mediaOpinionPull.social"] = mediaPull?.social ?? 0;
        temporaryUpdates["mediaOpinionPull.slantEconomic"] = slant.economic;
        temporaryUpdates["mediaOpinionPull.slantSocial"] = slant.social;
        temporaryUpdates["mediaOpinionPull.strength"] = slant.strength;
      } else if (stored && stored.strength > 0) {
        temporaryUpdates["mediaOpinionPull.turn"] = turn;
        temporaryUpdates["mediaOpinionPull.economic"] = 0;
        temporaryUpdates["mediaOpinionPull.social"] = 0;
        temporaryUpdates["mediaOpinionPull.strength"] = 0;
      }
    }

    // Durable channel: seed its live-update accumulator with whatever the
    // temporary channel already computed this turn (banded shift OR decay)
    // so a durable delta STACKS on top of it rather than clobbering it when
    // a bucket has both a durable and an ordinary effect active on the same
    // axis in the same turn.
    const durableAcc: DurableShiftAccumulators = {
      liveUpdates: { ...temporaryUpdates },
      defaultUpdates: {},
    };
    for (const axis of ["economicLean", "socialLean"] as const) {
      for (const [key, netDelta] of Object.entries(durableShifts[axis])) {
        const bucket = splitBucketKey(key);
        if (!netDelta || !bucket) continue;
        applyDurableBucketShift(
          bucket.dim,
          bucket.bucket,
          axis,
          netDelta,
          (dim, name) => readLayer1Overlay(stateDefaults, dim, name, axis),
          durableAcc
        );
      }
    }
    // Durable TURNOUT, the Voting Rights Act's enfranchisement channel. A
    // separate loop because it routes through its own clamp and overlay
    // (`layer1TurnoutOverrides`), not the lean channel's.
    for (const [key, netDelta] of Object.entries(durableShifts.turnout)) {
      const bucket = splitBucketKey(key);
      if (!netDelta || !bucket) continue;
      applyDurableBucketTurnoutShift(
        bucket.dim,
        bucket.bucket,
        netDelta,
        (dim, name) => readLayer1TurnoutOverlay(stateDefaults, dim, name),
        durableAcc
      );
    }
    const updates = durableAcc.liveUpdates;
    const durableDefaultUpdates = durableAcc.defaultUpdates;

    if (Object.keys(updates).length > 0) {
      const cacheLean = computeCacheUpdate(demographics, updates, leanContext);
      bulkOps.push({
        updateOne: {
          filter: { _id: state._id },
          update: {
            $set: {
              ...updates,
              ...(cacheLean
                ? {
                    cachedEconomicLean: cacheLean.economicLean,
                    cachedSocialLean: cacheLean.socialLean,
                  }
                : {}),
              lastUpdated: new Date(),
            },
          },
        },
      });
      if (cacheLean) {
        // Mirror the admin-route cache writer: `states` keeps a copy of the
        // derived leans for quick map/primary reads.
        stateCacheOps.push({
          updateOne: {
            filter: { _id: state._id },
            update: {
              $set: {
                cachedEconomicLean: cacheLean.economicLean,
                cachedSocialLean: cacheLean.socialLean,
                demographicsLastUpdated: new Date(),
              },
            },
          },
        });
      }
    }
    if (Object.keys(durableDefaultUpdates).length > 0) {
      defaultBulkOps.push({
        updateOne: {
          filter: { _id: state._id },
          update: { $set: { ...durableDefaultUpdates, lastUpdated: new Date() } },
        },
      });
    }
  }

  // Single bulkWrite instead of N individual updateOne calls
  if (bulkOps.length > 0) {
    await stateDemographicsCollection(db).bulkWrite(bulkOps);
  }
  if (stateCacheOps.length > 0) {
    await statesCollection(db).bulkWrite(stateCacheOps);
  }
  if (defaultBulkOps.length > 0) {
    await demographicDefaultsCollection(db).bulkWrite(defaultBulkOps);
  }

  return bulkOps.length;
}
