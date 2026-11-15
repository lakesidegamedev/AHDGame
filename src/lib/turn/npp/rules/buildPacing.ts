/**
 * Pacing for new NPP capacity, so a lane converges on its demand instead of
 * overshooting it.
 *
 * Plain data in, plain data out. The measured gap only moves when plants come
 * online, so every corporation reading it in the same turn sees the same
 * shortage. Netting queued and claimed capacity (rules/demandClaims) keeps the
 * total inside the gap; this adds a per-turn ceiling, so the gap is closed in
 * steps and the next turn's reading corrects the next step.
 */
import { floorUnitsToPlants } from "@/lib/corporations/wholePlants/rules";
import {
  NPP_PACE_MAX_PLANTS_PER_LANE,
  NPP_PACE_UNMET_SHARE,
} from "@/lib/turn/npp/nppCorporationTuning";

export interface PaceRoomInput {
  /** Measured unmet demand of the cell, before queued and claimed capacity. Null when unreadable. */
  grossUnmetUnits: number | null;
  /** New capacity already granted this turn against the same gap (claim key). */
  grantedAgainstGapUnits: number;
  /** New capacity already granted this turn in the same country and lane. */
  grantedInLaneUnits: number;
  /** One plant of this lane; zero or less disables the plant-count ceiling. */
  plantUnits: number;
}

/**
 * Units of new capacity still allowed this turn in a cell: the smaller of a
 * share of the measured gap (at least one plant) and a plant-count ceiling for the country and
 * lane, less what was already granted. An unreadable gap never caps, the same
 * stance as foundingUnmetSizing.
 */
export function paceRoomUnits(input: PaceRoomInput): number {
  const gross =
    input.grossUnmetUnits == null || !Number.isFinite(input.grossUnmetUnits)
      ? null
      : Math.max(0, input.grossUnmetUnits);
  // A share smaller than one plant would never let the tail of a gap close, so
  // a measured gap always admits one plant a turn.
  const shareRoom =
    gross == null
      ? Number.POSITIVE_INFINITY
      : (gross > 0 ? Math.max(gross * NPP_PACE_UNMET_SHARE, Math.max(0, input.plantUnits)) : 0) -
        input.grantedAgainstGapUnits;
  const laneRoom =
    input.plantUnits > 0
      ? NPP_PACE_MAX_PLANTS_PER_LANE * input.plantUnits - input.grantedInLaneUnits
      : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(shareRoom, laneRoom));
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
