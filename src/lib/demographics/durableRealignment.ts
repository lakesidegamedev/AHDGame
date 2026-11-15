/**
 * Durable base-value relocation: the SHARED mechanism behind every "this
 * permanently changes who the electorate is" channel: era checkpoints
 * (`eraCheckpoints.ts` / `src/lib/turn/eraCheckpointTurn.ts`) and designated
 * ("permanent") legislation (`src/lib/demographicEffects.ts`).
 *
 * SCOTUS rulings that durably move the electorate (Brown v. Board / the
 * Southern realignment, the national Civil Rights Act/Voting Rights Act
 * consolidation, Engel v. Vitale, Reynolds v. Sims, Griswold v. Connecticut,
 * Miranda v. Arizona; see the checkpoint registry at the bottom of
 * `eraCheckpoints.ts`) are wired through this SAME era-checkpoint mechanism,
 * gated by `EraCheckpoint.triggerCaseKey`, rather than through a separate
 * SCOTUS-specific turn processor. `docketCase.demographicSignal` itself
 * remains a read-only `countryHistoryEvents` recording for cases with NO
 * authored checkpoint (Baker v. Carr, Wesberry v. Sanders); see the file
 * header of `src/lib/scotus/presetData/1953.ts`.
 *
 * Every one of them answers the same question, "durably move this (state,
 * census bucket, axis) base value by N", and does it the same way: it writes
 * `demographicDefaults.layer1PositionOverrides[dim][bucket].<axis>`, a durable
 * per-census-bucket delta applied by `granularElectorate.ts`'s
 * `applyPositionOverlay` directly to the Layer-1 position table BEFORE cell
 * derivation (see the `Layer1PositionOverlay` type doc in
 * `src/lib/db/types/demographics.ts`). The overlay is never decayed, and the
 * temporary legislation drift on the live doc decays toward zero, not toward
 * this base, so nothing pulls the shift back.
 *
 * TURNOUT is a separate, parallel channel (`applyDurableBucketTurnoutShift`),
 * not a widened axis on the above: its overlay is
 * `demographicDefaults.layer1TurnoutOverrides` (a bucket-rate delta consumed
 * by `granularElectorate.ts`'s `buildUsTurnoutRates`/`applyTurnoutRateOverlay`
 * BEFORE cell derivation, exactly like the position overlay). This is the
 * mechanism the Voting Rights Act of 1965 needs: its real effect was
 * enfranchisement (Black registration in Mississippi ~6.7% -> 59.8%,
 * 1965-1967, U.S. Commission on Civil Rights, 1968), not a lean shift among
 * voters who could already cast a ballot.
 *
 * Callers own reading the current doc values and persisting the returned
 * dotted-path `$set` updates (typically two bulkWrite calls: one against
 * `stateDemographics`, one against `demographicDefaults`). This module is
 * pure and does no I/O.
 */
import type { StateDemographics } from "@/lib/db/types/demographics";

/** Absolute bounds of the shared lean axis. */
const LEAN_ABS_MIN = -5;
const LEAN_ABS_MAX = 5;

/** Apply one turn's net delta to a lean value, clamped to the shared axis. */
export function applyDurableStep(current: number, delta: number): number {
  if (delta === 0) return current;
  return Math.max(LEAN_ABS_MIN, Math.min(LEAN_ABS_MAX, current + delta));
}

export type LeanAxis = "economicLean" | "socialLean";

/**
 * Absolute bounds of the durable turnout-rate OVERLAY delta accumulator
 * (`layer1TurnoutOverrides[dim][bucket]`, see `Layer1TurnoutOverlay`). This
 * is a SIGNED percentage-point delta added on top of a
 * `DEMOGRAPHIC_TURNOUT_RATES` baseline, not an absolute turnout reading, so
 * the bound stays symmetric: suppression can pull as far negative as
 * enfranchisement pushes positive. ±80 covers the largest modeled swing
 * (~53pp) while bounding runaway accumulation.
 */
const TURNOUT_OVERLAY_DELTA_MIN = -80;
const TURNOUT_OVERLAY_DELTA_MAX = 80;

/**
 * Apply one turn's net delta to the turnout-rate OVERLAY accumulator — a
 * signed bucket-rate delta, NOT an absolute turnout reading (see
 * `TURNOUT_OVERLAY_DELTA_MIN/MAX`'s doc comment for why this needs its own,
 * symmetric bound rather than [0, 100]).
 */
function applyDurableTurnoutOverlayStep(current: number, delta: number): number {
  if (delta === 0) return current;
  return Math.max(TURNOUT_OVERLAY_DELTA_MIN, Math.min(TURNOUT_OVERLAY_DELTA_MAX, current + delta));
}

export interface DurableShiftAccumulators {
  /** dotted-path `$set` updates for the LIVE `stateDemographics` doc. */
  liveUpdates: Record<string, number>;
  /**
   * dotted-path `$set` updates for the `demographicDefaults` doc: the
   * `layer1PositionOverrides` and `layer1TurnoutOverrides` bucket overlays.
   */
  defaultUpdates: Record<string, number>;
}

/** Current cumulative `layer1PositionOverrides[dim][bucket][axis]` value, or 0 if unset. */
export function readLayer1Overlay(
  defaults: StateDemographics | null | undefined,
  dim: string,
  bucket: string,
  axis: LeanAxis
): number {
  return defaults?.layer1PositionOverrides?.[dim]?.[bucket]?.[axis] ?? 0;
}

/**
 * Durably relocate ONE Layer-1 census bucket's position by `netDelta`,
 * layering the write on top of whatever this same turn's OTHER targets already
 * staged in `acc` (several targets can land on the same bucket within one turn
 * and their contributions must sum, not clobber each other).
 *
 * No-op when `netDelta` is 0 (nothing to relocate this turn, e.g. a
 * checkpoint fully counter-pressured to a standstill).
 */
export function applyDurableBucketShift(
  dim: string,
  bucket: string,
  axis: LeanAxis,
  netDelta: number,
  readOverlay: (dim: string, bucket: string) => number,
  acc: DurableShiftAccumulators
): void {
  if (netDelta === 0) return;
  const overlayKey = `layer1PositionOverrides.${dim}.${bucket}.${axis}`;
  const overlayBase = acc.defaultUpdates[overlayKey] ?? readOverlay(dim, bucket);
  acc.defaultUpdates[overlayKey] = applyDurableStep(overlayBase, netDelta);
}

// ─── Turnout channel ────────────────────────────────────────────────────────
//
// A durable TURNOUT relocation is the enfranchisement-shaped counterpart of
// the lean relocation above (the Voting Rights Act's worked example: it did
// not make already-enfranchised Southern Black voters more Democratic, it let
// voters who previously could not vote at all cast a ballot; see
// `src/lib/db/types/legislation.ts`'s `DemographicEffect.permanent` doc
// comment). It does not reuse `LeanAxis`/`applyDurableStep`: turnout is a
// bounded percentage-point delta, not a signed value on the -5..+5 ruler, so
// it needs its own clamp (`TURNOUT_OVERLAY_DELTA_MIN/MAX`).

/** Current cumulative `layer1TurnoutOverrides[dim][bucket]` value, or 0 if unset. */
export function readLayer1TurnoutOverlay(
  defaults: StateDemographics | null | undefined,
  dim: string,
  bucket: string
): number {
  return defaults?.layer1TurnoutOverrides?.[dim]?.[bucket] ?? 0;
}

/**
 * Durably relocate ONE Layer-1 census bucket's TURNOUT rate, the turnout
 * counterpart of `applyDurableBucketShift` (e.g. the Voting Rights Act
 * checkpoint's exact `race:black` × Southern-states target).
 */
export function applyDurableBucketTurnoutShift(
  dim: string,
  bucket: string,
  netDelta: number,
  readOverlay: (dim: string, bucket: string) => number,
  acc: DurableShiftAccumulators
): void {
  if (netDelta === 0) return;
  const overlayKey = `layer1TurnoutOverrides.${dim}.${bucket}`;
  const overlayBase = acc.defaultUpdates[overlayKey] ?? readOverlay(dim, bucket);
  acc.defaultUpdates[overlayKey] = applyDurableTurnoutOverlayStep(overlayBase, netDelta);
}
