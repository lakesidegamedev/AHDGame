/**
 * Attacks and market splits as CAPACITY transfers (plants tier).
 *
 * Under `marketSystemMode >= "plants"` the turn processor RESTATES a
 * sector's `revenue` from `capitalStock × mixPrice` every turn. Any other
 * writer that `$inc`s `revenue` is erased next turn (attacker never keeps
 * what it took) or double-counted for one turn against unmoved capacity.
 *
 * This module holds the plants translation shared by the two player routes
 * and the NPP attack runner, so the three can never disagree:
 *
 *   1. the ₳ capture the existing capture math produces is turned into
 *      CAPACITY UNITS at the DEFENDER's production mix, since the defender
 *      is the side losing physical plant;
 *   2. the defender loses all of those units;
 *   3. the attacker receives only {@link ATTACK_CAPTURE_EFFICIENCY} of them;
 *   4. the attacker pays at least the build price of what it receives, times
 *      {@link ATTACK_BUILD_PRICE_PREMIUM}, so capture is never a cheap
 *      substitute for building.
 *
 * Nothing here runs below the plants tier: every caller keeps its legacy ₳
 * revenue path behind a mode check.
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
 * Under plants `revenue` is the cleared amount scaled by the ramp, not a measure
 * of what is there to take. A mothballed factory reports revenue 0, making it
 * un-attackable via the thresholds and free to seize via a zero attack cost.
 *
 * The basis is therefore the CAPACITY NAMEPLATE: built `capitalStock` priced
 * through its strategy mix. That is what `sectorTurn` restates `revenue` from
 * before fill and ramp, so it is commensurable with the legacy basis, ₳-only, and
 * stable across bad market turns.
 *
 * Undelivered build orders are EXCLUDED: an attack seizes plant that exists.
 *
 * Returns `null` below plants or for a sector with no capacity, meaning use the
 * legacy revenue basis.
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

/**
 * The PAID BASIS that moves with captured capacity.
 *
 * Book value is what a corp actually spent on the capacity it holds, so an
 * attack must move it alongside the units or the books stop balancing: a
 * defender keeping its whole basis over fewer units books survivors above
 * cost (an exit mint), and an attacker gaining units with no basis books free
 * plant at zero (an exit theft).
 *
 * The rule is per-unit and symmetric: the defender loses `unitsTaken / stock`
 * of its basis, the attacker gains the share matching `unitsReceived`. The
 * `1 - ATTACK_CAPTURE_EFFICIENCY` difference is basis destroyed with the
 * plant it priced, matching the units.
 *
 * The attacker's attack payment is deliberately NOT added: the attack price is
 * floored above `build price × ATTACK_BUILD_PRICE_PREMIUM`, so booking it
 * would make conquest a way to write capacity UP.
 *
 * Returns `null` on either leg when the source carries no recorded basis
 * (legacy row, or one the turn processor has not stamped yet). Callers must
 * write NOTHING for that leg and let the list-price fallback stand; an `$inc`
 * against an absent field would materialise it and destroy the fallback.
 */
export function capacityCaptureBookTransfer(args: {
  /** Defender's recorded `capacityBookAnchor`, or null/undefined if it has none. */
  sourceBookAnchor: number | null | undefined;
  /** Defender's capacity BEFORE the capture. */
  sourceStock: number;
  unitsTaken: number;
  unitsReceived: number;
}): { bookRemovedFromSource: number; bookToAttacker: number } | null {
  const { sourceBookAnchor, sourceStock, unitsTaken, unitsReceived } = args;
  if (
    typeof sourceBookAnchor !== "number" ||
    !Number.isFinite(sourceBookAnchor) ||
    sourceBookAnchor < 0
  ) {
    return null;
  }
  if (!(Number.isFinite(sourceStock) && sourceStock > 0)) return null;
  const perUnit = sourceBookAnchor / sourceStock;
  const takenFraction = Math.max(0, Math.min(1, unitsTaken / sourceStock));
  const receivedUnits = Math.max(0, Math.min(unitsReceived, unitsTaken));
  return {
    bookRemovedFromSource: sourceBookAnchor * takenFraction,
    bookToAttacker: perUnit * receivedUnits,
  };
}

/**
 * The two `$set` fragments an owned-sector capture writes for the paid basis.
 *
 * Absolute `$set`s, never `$inc`s: `capacityBookAnchor` is OPTIONAL, and an
 * `$inc` on a row without one materialises the field and permanently
 * replaces the list-price fallback.
 *
 * DEFENDER: stamped only if it already carries a basis; otherwise the
 * `remaining stock × list price` fallback is already pro-rata.
 *
 * ATTACKER: always stamped, since doing nothing is the mint. It gets its own
 * pre-attack fallback plus the basis that travelled with the captured plant.
 *
 * Returns empty fragments when the defender has no basis and no stock.
 */
export function capacityCaptureBookUpdates(args: {
  defender: {
    sectorType: CorporationType;
    industryModel?: string | null;
    mediaDiscriminator?: "entertainment" | null;
    /**
     * Priced at this strategy when no recorded basis exists (identity B).
     * REQUIRED but nullable so the compiler enumerates every caller: capacity
     * is priced at the RPU of the product it makes, and a caller that silently
     * omitted this would fall back to the sector-type default and value a
     * rare-earth plant at the diversified price.
     */
    strategyId: string | null;
    capitalStock?: number | null;
    capacityBookAnchor?: number | null;
  };
  /** Attacker's receiving sector; null when a brand-new sector is being created. */
  attacker: {
    sectorType: CorporationType;
    industryModel?: string | null;
    mediaDiscriminator?: "entertainment" | null;
    strategyId: string | null;
    capitalStock?: number | null;
    capacityBookAnchor?: number | null;
  } | null;
  unitsTaken: number;
  unitsReceived: number;
  year: number;
  preset?: string;
  eraUnitScale: number;
}): { defenderSet: { capacityBookAnchor?: number }; attackerBookAnchor: number } {
  const { defender, attacker, unitsTaken, unitsReceived, year, eraUnitScale, preset } = args;
  const defenderStock =
    typeof defender.capitalStock === "number" && Number.isFinite(defender.capitalStock)
      ? Math.max(0, defender.capitalStock)
      : 0;
  const transfer = capacityCaptureBookTransfer({
    // The defender's fallback is its list value, and that is the honest basis
    // for capacity that predates the build path — so price the transfer off it
    // when no basis is recorded, rather than moving nothing.
    sourceBookAnchor:
      typeof defender.capacityBookAnchor === "number" &&
      Number.isFinite(defender.capacityBookAnchor) &&
      defender.capacityBookAnchor >= 0
        ? defender.capacityBookAnchor
        : defenderStock *
          capacityPricePerUnit(
            defender.sectorType,
            year,
            eraUnitScale,
            defender.strategyId ?? null,
            defender.industryModel,
            defender.mediaDiscriminator,
            preset
          ),
    sourceStock: defenderStock,
    unitsTaken,
    unitsReceived,
  });
  const hasDefenderBasis =
    typeof defender.capacityBookAnchor === "number" &&
    Number.isFinite(defender.capacityBookAnchor) &&
    defender.capacityBookAnchor >= 0;
  const attackerStock =
    attacker && typeof attacker.capitalStock === "number" && Number.isFinite(attacker.capitalStock)
      ? Math.max(0, attacker.capitalStock)
      : 0;
  const attackerPrior =
    attacker &&
    typeof attacker.capacityBookAnchor === "number" &&
    Number.isFinite(attacker.capacityBookAnchor) &&
    attacker.capacityBookAnchor >= 0
      ? attacker.capacityBookAnchor
      : attackerStock *
        capacityPricePerUnit(
          attacker?.sectorType ?? defender.sectorType,
          year,
          eraUnitScale,
          // Falls back to the defender's strategy alongside its sectorType, so
          // the pair is always read from the same sector rather than mixing an
          // attacker type with a defender strategy.
          (attacker ? attacker.strategyId : defender.strategyId) ?? null,
          attacker?.industryModel ?? defender.industryModel,
          attacker?.mediaDiscriminator ?? defender.mediaDiscriminator,
          preset
        );
  return {
    defenderSet:
      hasDefenderBasis && transfer
        ? {
            capacityBookAnchor: Math.max(
              0,
              (defender.capacityBookAnchor as number) - transfer.bookRemovedFromSource
            ),
          }
        : {},
    attackerBookAnchor: Math.max(0, attackerPrior + (transfer?.bookToAttacker ?? 0)),
  };
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
 * where you are standing; none describe seizing one that already exists, and
 * several (acumen, tech) would hand the strongest attackers a discount on the
 * very lever meant to keep attacking expensive.
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
