/**
 * Checkpoint de-duplication for the interpolated era baseline.
 *
 * Era anchor tables are authored from real results, so a later anchor
 * already contains the movement checkpoints model as a live pull. Adding a
 * checkpoint overlay on top would count the same history twice and pin
 * states at the axis edge. This module subtracts from each anchor exactly
 * what checkpoints had delivered by that anchor's year, so
 * interpolated baseline + durable overlay == authored anchor.
 *
 * Subtraction is sound only where the checkpoint is guaranteed to run:
 * every checkpoint always fires (fallback start turn), and checkpoints
 * only run in 1953-seeded worlds. CHECKPOINT_SEED_YEAR is the shared gate
 * for both; keep it in sync with eraCheckpointTurn.
 *
 * Uses EraCheckpoint.historicalWindow (real years), never in-world turns,
 * so a pure function of year does not depend on world state.
 */
import { ERA_CHECKPOINTS, type EraCheckpoint } from "./eraCheckpoints";

/**
 * The only `startingYear` whose worlds run era checkpoints. Must stay in sync
 * with the gate in `src/lib/turn/eraCheckpointTurn.ts` — see the module doc.
 */
const CHECKPOINT_SEED_YEAR = 1953;

/**
 * Axes a baseline table can carry. The two lean axes live on the position
 * table; `turnout` is a separate substrate (bucket RATES, percentage points)
 * with its own overlay, but it needs identical de-duplication — the Voting
 * Rights Act checkpoint adds +40pp to `race:black` turnout in MS/AL and +20pp
 * in LA/GA/SC/VA, and the authored era turnout tables describe the same
 * enfranchisement. Without subtracting it the covered states would receive the
 * franchise twice.
 */
export type BakedAxis = "economicLean" | "socialLean" | "turnout";

/**
 * Fraction of a checkpoint's `totalShift` that real history had delivered by
 * `year`: 0 before the window opens, 1 after it closes, linear inside.
 * A checkpoint with no `historicalWindow` is treated as not baked into the
 * anchors at all (fraction 0) — the conservative direction, since
 * under-subtracting leaves a visible double-count to find, while
 * over-subtracting silently moves the electorate the wrong way.
 */
function historicalDeliveredFraction(checkpoint: EraCheckpoint, year: number): number {
  const win = checkpoint.historicalWindow;
  if (!win) return 0;
  if (year <= win.startYear) return 0;
  if (year >= win.endYear) return 1;
  return (year - win.startYear) / (win.endYear - win.startYear);
}

/**
 * Total per-(dim, bucket) lean shift the checkpoints had baked into the
 * authored anchor tables for `stateId` by `year`, keyed `"dim:key"` → delta.
 *
 * Every checkpoint target is a (`dim`, `bucket`) pair and lands on its bucket
 * directly, exactly as `eraCheckpointTurn.ts` applies it, so the subtraction
 * matches what the overlay will re-add.
 *
 * Returns an empty record for any world that does not run checkpoints.
 */
export function bakedCheckpointBucketShifts(
  stateId: string,
  axis: BakedAxis,
  year: number,
  startingYear: number | null | undefined,
  countryId = "US"
): Record<string, number> {
  if (startingYear !== CHECKPOINT_SEED_YEAR) return {};

  const bucketShifts: Record<string, number> = {};
  for (const checkpoint of ERA_CHECKPOINTS) {
    if (checkpoint.countryId !== countryId) continue;
    const fraction = historicalDeliveredFraction(checkpoint, year);
    if (fraction === 0) continue;

    for (const target of checkpoint.targets) {
      if (target.axis !== axis) continue;
      if (!target.stateIds.includes(stateId)) continue;
      if (!target.dim || !target.bucket) continue;
      const k = `${target.dim}:${target.bucket}`;
      bucketShifts[k] = (bucketShifts[k] ?? 0) + target.totalShift * fraction;
    }
  }
  return bucketShifts;
}
