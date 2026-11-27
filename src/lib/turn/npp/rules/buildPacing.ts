/**
 * Pacing for new NPP capacity, so a lane converges on its demand instead of
 * overshooting it.
 *
 * Plain data in, plain data out. The measured gap only moves when plants come
 * online, so every corporation reading it in the same turn sees the same
 * shortage. The turn's budget is a share of the gap left once capacity already
 * under construction is netted out (rules/demandClaims), so a big shortage gets
 * a big step and a gap the queues already cover gets none. Each turn's reading
 * corrects the next step.
 */
import { floorUnitsToPlants } from "@/lib/corporations/wholePlants/rules";
import {
  NPP_PACE_UNMET_SHARE,
  NPP_PACE_UNREADABLE_GAP_PLANTS,
} from "@/lib/turn/npp/nppCorporationTuning";

export interface PaceRoomInput {
  /**
   * Measured unmet demand of the cell at the start of the pass, net of capacity
   * already under construction for it. Null when unreadable.
   */
  netUnmetUnits: number | null;
  /** New capacity already granted this turn against the same gap (claim key). */
  grantedAgainstGapUnits: number;
  /** One plant of this lane; zero or less disables the plant floor and the unreadable ceiling. */
  plantUnits: number;
}

/**
 * Units of new capacity still allowed this turn in a cell: a share of the gap
 * left after queued capacity (at least one plant while any gap is left), less
 * what was already granted. No gap left means no room. A gap that cannot be
 * read is held to a few plants a turn, so a missing measurement never opens a
 * lane wide.
 */
export function paceRoomUnits(input: PaceRoomInput): number {
  const plant = Math.max(0, input.plantUnits);
  const granted = Math.max(0, input.grantedAgainstGapUnits);
  const net =
    input.netUnmetUnits == null || !Number.isFinite(input.netUnmetUnits)
      ? null
      : Math.max(0, input.netUnmetUnits);
  if (net == null) {
    return plant > 0
      ? Math.max(0, NPP_PACE_UNREADABLE_GAP_PLANTS * plant - granted)
      : Number.POSITIVE_INFINITY;
  }
  if (!(net > 0)) return 0;
  // A share smaller than one plant would never let the tail of a gap close, so
  // a gap still open after the queues always admits one plant a turn.
  return Math.max(0, Math.max(net * NPP_PACE_UNMET_SHARE, plant) - granted);
}

/**
 * The growth leg of an order, cut to the pace room. Whole-plant lanes grow in
 * whole plants, so a room under one plant allows none.
 */
export function pacedGrowthUnits(args: {
  growthUnits: number;
  roomUnits: number;
  plantUnits: number;
  wholePlants: boolean;
}): number {
  if (!(args.growthUnits > 0)) return 0;
  if (args.growthUnits <= args.roomUnits) return args.growthUnits;
  if (args.wholePlants && args.plantUnits > 0) {
    return floorUnitsToPlants(args.roomUnits, args.plantUnits);
  }
  return Math.max(0, Math.floor(args.roomUnits));
}

/**
 * Whether a lane's price has stood at or above base on both the latest and the
 * prior snapshot, in at least one output leg, so a one-turn spike does not
 * found a company. Each entry is [current, prior] price over base for one leg.
 * A lane with no current price reading has no spike to wait out and passes.
 */
export function priceSignalPersisted(
  legs: readonly (readonly [number | null, number | null])[]
): boolean {
  const read = legs.filter(([current]) => current != null && Number.isFinite(current));
  if (read.length === 0) return true;
  return read.some(
    ([current, prior]) =>
      (current as number) >= 1 && prior != null && Number.isFinite(prior) && prior >= 1
  );
}
