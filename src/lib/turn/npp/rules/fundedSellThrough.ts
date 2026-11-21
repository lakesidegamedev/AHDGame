/**
 * The demand reading NPP decisions use for one plant, on either market path.
 *
 * Plain data in, plain data out: no clock, rng or ambient state.
 *
 * On a legacy world `demandThrottleFactor` is the share of capacity the
 * clearing pass let the plant run because buyers would take no more: below 1
 * means unsold demand room ran out, a glut signal.
 *
 * On a funded world the reading is sell-through from the plant's latest
 * settlement receipt: units sold over units offered (this turn's output plus
 * stock put up for sale). 1 means every offered unit found a buyer, so the
 * market took all the plant could bring; under 1 means output went unsold.
 * Sell-through is used because a shared throttle-style field would mix two
 * causes of low output: buyers stopped taking goods, and the plant could not
 * make them because inputs or cash ran short. A farm without fertilizer runs
 * at a quarter of nameplate and sells every unit; read as a glut, that would
 * hold back growth and entry in exactly the markets that are short.
 */

import { TURNS_PER_DAY } from "@/lib/constants/corporationsClient";
import { STRANDED_LOW_FILL_THRESHOLD } from "@/lib/corporations/strandedPlant";
import {
  offtakeUnits,
  type CaptiveProduct,
} from "@/lib/market/producerMarket/captiveDeliveryRules";

/**
 * A receipt older than this many turns says nothing about the plant now. The
 * AI pass reads the receipt settled earlier in the same turn; the mine recipe
 * pass runs at turn start and reads the previous turn's. A mothballed or idle
 * plant keeps its last receipt, which then ages out.
 */
export const FUNDED_SALE_EVIDENCE_MAX_AGE_TURNS = 1;

/** The parts of a funded settlement receipt this reading uses. */
export interface FundedReceiptLike {
  worldEpoch?: string | null;
  turn?: number | null;
  capacityUnits?: number | null;
  offeredUnits?: number | null;
  soldUnits?: number | null;
  /** Per-product lines; `internalDeliveredUnits` is output handed to the company's own sites. */
  products?: readonly CaptiveProduct[] | null;
}

export interface DemandReadingSectorLike {
  demandThrottleFactor?: number | null;
  operatingCapacityUnits?: number | null;
  producerSettlement?: FundedReceiptLike | null;
}

function finiteOrNull(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/** The sector's settlement receipt when it belongs to the given funded world. */
function currentReceipt(
  sector: DemandReadingSectorLike,
  fundedWorldEpoch: string
): FundedReceiptLike | null {
  const r = sector.producerSettlement;
  return r && r.worldEpoch === fundedWorldEpoch ? r : null;
}

/**
 * Sold over offered from the sector's receipt in this funded world, clamped to
 * [0, 1]. Null without a receipt or when nothing was offered: a plant that made
 * and held nothing gives no evidence about demand either way. With `turn`, a
 * receipt older than FUNDED_SALE_EVIDENCE_MAX_AGE_TURNS is no evidence too.
 */
export function fundedSellThrough(
  sector: DemandReadingSectorLike,
  fundedWorldEpoch: string,
  turn?: number
): number | null {
  return fundedShare(sector, fundedWorldEpoch, turn, (r) =>
    Math.max(0, finiteOrNull(r.soldUnits) ?? 0)
  );
}

/**
 * Taken over offered: units sold plus units handed to the company's own sites,
 * over units offered, clamped to [0, 1]. Offered output includes own-site
 * deliveries, so a plant feeding its own company is not a glut. Same null
 * rules as fundedSellThrough.
 */
export function fundedTakenShare(
  sector: DemandReadingSectorLike,
  fundedWorldEpoch: string,
  turn?: number
): number | null {
  return fundedShare(sector, fundedWorldEpoch, turn, (r) =>
    offtakeUnits({
      soldUnits: finiteOrNull(r.soldUnits) ?? 0,
      products: r.products ?? undefined,
    })
  );
}

function fundedShare(
  sector: DemandReadingSectorLike,
  fundedWorldEpoch: string,
  turn: number | undefined,
  takenOf: (r: FundedReceiptLike) => number
): number | null {
  const r = currentReceipt(sector, fundedWorldEpoch);
  if (!r) return null;
  if (turn != null) {
    const receiptTurn = finiteOrNull(r.turn);
    if (receiptTurn == null || turn - receiptTurn > FUNDED_SALE_EVIDENCE_MAX_AGE_TURNS) return null;
  }
  const offered = finiteOrNull(r.offeredUnits);
  if (offered == null || !(offered > 0)) return null;
  return Math.max(0, Math.min(1, takenOf(r) / offered));
}

/** When a world reads funded sales for AI decisions, and for which turn. */
export interface SoldShareWorld {
  /** Funded world epoch; absent on a legacy world. */
  fundedWorldEpoch?: string | null;
  /** First funded turn (opening turn + 1); earlier turns run the legacy model. */
  firstFundedTurn?: number | null;
  /** The turn deciding. */
  turn: number;
}

/** The funded epoch when this turn reads funded sales, else null. */
export function soldShareFundedEpoch(world: SoldShareWorld): string | null {
  if (!world.fundedWorldEpoch || world.firstFundedTurn == null) return null;
  return world.turn >= world.firstFundedTurn ? world.fundedWorldEpoch : null;
}

/** The world facts the AI sold-share reading needs, from the game state document. */
export function soldShareWorldOf(
  gameState:
    | {
        worldEpochId?: string | null;
        producerOpening?: { worldEpoch?: string | null; turn?: number | null } | null;
      }
    | null
    | undefined,
  turn: number
): SoldShareWorld {
  const opening = gameState?.producerOpening;
  const epoch = gameState?.worldEpochId;
  if (!epoch || !opening || opening.worldEpoch !== epoch || opening.turn == null) return { turn };
  return { fundedWorldEpoch: epoch, firstFundedTurn: opening.turn + 1, turn };
}

/**
 * The sold share AI-run companies act on: wages, output policy, glut
 * mothballing, strategy pivots, mine recipe switches and contract pricing.
 *
 * On a funded turn it is fundedTakenShare (own-site deliveries count as
 * taken) with freshness: null (no evidence)
 * for a plant with no receipt from this world, a receipt older than
 * FUNDED_SALE_EVIDENCE_MAX_AGE_TURNS, or nothing offered. Null never reads as
 * "sold nothing", and a funded turn never falls back to the legacy clearing
 * figure, which the funded market does not pay on. Before the first funded
 * turn, and on legacy worlds, it is the legacy `soldFraction`.
 */
export function nppSoldShare(
  sector: DemandReadingSectorLike & { soldFraction?: number | null },
  world: SoldShareWorld
): number | null {
  const epoch = soldShareFundedEpoch(world);
  if (epoch) return fundedTakenShare(sector, epoch, world.turn);
  return finiteOrNull(sector.soldFraction);
}

/**
 * The demand-glut reading for NPP growth, saturation and mothball decisions:
 * funded sell-through on a funded world, the legacy throttle otherwise. Null
 * means no reading, which never blocks.
 */
export function nppDemandThrottle(
  sector: DemandReadingSectorLike,
  fundedWorldEpoch: string | null | undefined
): number | null {
  if (fundedWorldEpoch) return fundedSellThrough(sector, fundedWorldEpoch);
  return finiteOrNull(sector.demandThrottleFactor);
}

/**
 * Daily capacity basis for utilization. On a funded world the receipt's
 * per-turn capacity is the settled one; the legacy field is written by a pass
 * that does not price the funded market. Null when no reading applies.
 */
export function nppOperatingCapacityUnits(
  sector: DemandReadingSectorLike,
  fundedWorldEpoch: string | null | undefined
): number | null {
  if (fundedWorldEpoch) {
    const capacity = finiteOrNull(currentReceipt(sector, fundedWorldEpoch)?.capacityUnits);
    return capacity != null && capacity > 0 ? capacity * TURNS_PER_DAY : null;
  }
  return finiteOrNull(sector.operatingCapacityUnits);
}

/**
 * How one settled turn moves `fundedLowSaleTurns`: a taken share under
 * STRANDED_LOW_FILL_THRESHOLD extends the streak, one at or above it ends the
 * streak, and no reading (nothing offered) holds it.
 */
export function fundedLowSaleStreakStep(
  sellThrough: number | null
): "increment" | "reset" | "hold" {
  if (sellThrough == null) return "hold";
  return sellThrough < STRANDED_LOW_FILL_THRESHOLD ? "increment" : "reset";
}
