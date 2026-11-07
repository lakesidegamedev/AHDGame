/**
 * Attacks and market splits as CAPACITY transfers (plants tier).
 *
 * Under `marketSystemMode >= "plants"` a sector's `revenue` is RESTATED from
 * `capitalStock × mixPrice` by the turn processor every turn. Any other writer
 * that `$inc`s `revenue` is therefore either erased on the next turn (the
 * attacker never keeps what it took) or, worse, double-counted for one turn
 * against capacity that never moved. The attack/split paths were exactly that:
 * two revenue `$inc`s and a revenue-seeded new sector.
 *
 * This module holds the plants translation shared by the two player routes and
 * the NPP attack runner, so the three can never disagree:
 *
 *   1. the ₳ capture the existing (unchanged) capture math produces is turned
 *      into CAPACITY UNITS at the DEFENDER's production mix — the defender is
 *      the side losing physical plant, so its mix is the one that prices it;
 *   2. the defender loses all of those units;
 *   3. the attacker receives only {@link ATTACK_CAPTURE_EFFICIENCY} of them;
 *   4. the attacker pays at least the build price of what it receives, times
 *      {@link ATTACK_BUILD_PRICE_PREMIUM}, so capture is never a cheap
 *      substitute for building.
 *
 * Nothing here runs below the plants tier: every caller keeps its legacy ₳
 * revenue path byte-identical behind a mode check.
 */

import type { CorporationType } from "@/lib/constants/corporations";
import {
  ATTACK_BUILD_PRICE_PREMIUM,
  ATTACK_CAPTURE_EFFICIENCY,
  capacityPricePerUnit,
  revenuePerCapacityUnitForStrategy,
} from "@/lib/constants/capacityEconomy";
import { computeSectorImpliedUnits } from "@/lib/market/unownedHeadroom";
import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";

/**
 * World year for build pricing, resolved the same way `buildCapacity` does
 * (explicit `currentYear` when the game state carries one, else derived from
 * the turn counter).
 */
export function resolveWorldYear(
  currentYear: number | null | undefined,
  currentTurn: number | null | undefined
): number {
  if (typeof currentYear === "number" && Number.isFinite(currentYear)) return currentYear;
  const turn = typeof currentTurn === "number" && Number.isFinite(currentTurn) ? currentTurn : 0;
  return STARTING_YEAR + Math.floor((Math.max(1, turn) - 1) / TURNS_PER_YEAR);
}

/**
 * The ₳ quantity an attack is SIZED against, under plants.
 *
 * Every attack path (player route, NPP runner) used the defender's `revenue`
 * for three separate jobs: the minimum-target threshold, the contested amount,
 * and the attack price. Under plants `revenue` is what the market actually
 * cleared against the plant, scaled by the ramp — so it is not a measure of what
 * is there to take. Two failures followed, in opposite directions:
 *
 *   - a MOTHBALLED factory reports revenue 0, so it fell under every threshold
 *     and every `actualCapture <= 0` abort. A player could park capacity in
 *     mothball and it became permanently un-attackable while still counting as
 *     plant on the balance sheet and still restartable at will.
 *   - the same zero made `calculateAttackCostAnchor` return 0, so on any path
 *     that did let the attack through, seizing that capacity was FREE.
 *
 * The basis under plants is therefore the CAPACITY NAMEPLATE: the sector's built
 * `capitalStock` priced through its own strategy mix. That is precisely the
 * quantity `sectorTurn` restates `revenue` from before fill and ramp are applied,
 * so it is commensurable with the legacy basis, it is currency-free ₳ (no FX
 * enters), and it does not move when the market has a bad turn.
 *
 * Undelivered build orders are deliberately EXCLUDED: an attack seizes plant
 * that exists, not a construction contract the defender has paid for and not yet
 * received. Those stay with the defender.
 *
 * Returns `null` below plants, and for a sector with no capacity at all — both
 * mean "use the legacy revenue basis", which is the byte-identical path.
 */
export function attackCapacityBasisAnchor(
  sector: {
    sectorType: CorporationType;
    industryModel?: string | null;
    mediaDiscriminator?: "entertainment" | null;
    capitalStock?: number | null;
    strategyId?: string | null;
  },
  plantsEnabled: boolean,
  unitScale: number
): number | null {
  if (!plantsEnabled) return null;
  const stock =
    typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
      ? Math.max(0, sector.capitalStock)
      : 0;
  if (!(stock > 0)) return null;
  const anchor =
    stock *
    revenuePerCapacityUnitForStrategy(
      sector.sectorType,
      sector.strategyId,
      unitScale,
      sector.industryModel,
      sector.mediaDiscriminator
    );
  return Number.isFinite(anchor) && anchor > 0 ? anchor : null;
}

export interface CapacityCaptureResult {
  /** Capacity units removed from the defender (or from the unowned pool). */
  unitsTaken: number;
  /** Capacity units that actually reach the attacker (attrition applied). */
  unitsReceived: number;
}

/**
 * Convert an ₳ capture into the capacity units it represents at `strategyId`'s
 * output mix, and split it into taken vs received.
 *
 * `computeSectorImpliedUnits` is the same revenue -> units conversion the
 * engine's `impliedOutputUnits` and the unowned headroom derivation use, so the
 * units produced here are commensurable with `capitalStock` and with
 * `unownedSectors.headroomUnits`.
 */
export function capacityCaptureUnits(
  capturedAnchor: number,
  sectorType: CorporationType,
  strategyId: string | null | undefined,
  unitScale: number,
  industryModel?: string | null,
  mediaDiscriminator?: "entertainment" | null
): CapacityCaptureResult {
  const unitsTaken =
    Number.isFinite(capturedAnchor) && capturedAnchor > 0
      ? computeSectorImpliedUnits(
          sectorType,
          capturedAnchor,
          strategyId,
          unitScale,
          industryModel,
          mediaDiscriminator
        )
      : 0;
  return {
    unitsTaken,
    unitsReceived: unitsTaken * ATTACK_CAPTURE_EFFICIENCY,
  };
}

/**
 * The plants attack price: never below the legacy cost, never below the build
 * price of the capacity actually received (times the premium).
 *
 * Only the era-indexed base build price is used, not the situational
 * multipliers `computeBuildCost` applies (dominance, prime rate, acumen, tech,
 * host cost of living). Those describe the difficulty of COMMISSIONING a plant
 * where you are standing; none of them describe seizing one that already
 * exists, and several of them (acumen, tech) would hand the strongest attackers
 * a discount on the very lever meant to keep attacking expensive. The premium
 * is set above 1 with those multipliers assumed neutral, and the floor is a
 * `max`, so a build cheapened by acumen/tech can dip under the attack price —
 * which is the intended ordering.
 */
export function attackCostAnchorUnderPlants(args: {
  legacyCostAnchor: number;
  unitsReceived: number;
  sectorType: CorporationType;
  industryModel?: string | null;
  mediaDiscriminator?: "entertainment" | null;
  /**
   * Strategy of the sector being seized — the floor prices the capacity it
   * actually produces. REQUIRED but nullable (pass `null` for an unowned-pool
   * draw, which has no defender and clears on the pool's default mix) so the
   * compiler enumerates every caller.
   */
  strategyId: string | null;
  year: number;
  preset?: string;
  eraUnitScale: number;
}): number {
  const {
    legacyCostAnchor,
    unitsReceived,
    sectorType,
    industryModel,
    mediaDiscriminator,
    strategyId,
    year,
    preset,
    eraUnitScale,
  } = args;
  const legacy = Number.isFinite(legacyCostAnchor) ? Math.max(0, legacyCostAnchor) : 0;
  if (!(Number.isFinite(unitsReceived) && unitsReceived > 0)) return legacy;
  const capacityFloor =
    unitsReceived *
    capacityPricePerUnit(
      sectorType,
      year,
      eraUnitScale,
      strategyId ?? null,
      industryModel,
      mediaDiscriminator,
      preset
    ) *
    ATTACK_BUILD_PRICE_PREMIUM;
  return Math.round(Math.max(legacy, capacityFloor));
}
