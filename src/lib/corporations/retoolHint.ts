import { commodityMixWeight, type CommodityType } from "@/lib/constants/commodities";
import type { SectorStrategy } from "@/lib/constants/sectorStrategies";
import { DEMAND_PROBE_MARGIN } from "@/lib/turn/corporation/demandThrottle";

/**
 * Retool hint.
 *
 * A plant whose most valuable output sells poorly because its market is
 * oversupplied is often a strategy problem rather than a capacity one: a
 * technology plant on the software strategy in a glutted software market sells
 * all of its electronics and little of its software, while the hardware
 * strategy would make mostly electronics into a shortage. This finds that case
 * and names the strategy that would sell. It is advisory only: nothing here
 * changes production, and the strategy change itself goes through the normal
 * retool command with its cost and transition.
 *
 * What the plant sold comes from the record it was paid on. Where the funded
 * producer market settled the plant, that is its settlement: per product, what
 * it offered and what found a taker. The clearing fill on the sector is a
 * separate legacy reading of the same output against the lagged book and can
 * be far from what the plant was paid for, so it is used only where no
 * settlement as recent exists.
 *
 * The hint names an oversupplied main product only when that product's market
 * book shows more supply than demand. A plant that sold little into a short
 * market has some other problem, and a strategy change is not the answer.
 *
 * Fills for a candidate strategy are estimated from the sector's own market
 * book, with the plant's current output taken out and the candidate's output at
 * full capacity added in, so the hint never recommends a mix that would itself
 * flood the market it points at.
 */

/** A plant whose value-weighted fill clears this runs at full capacity under the throttle. */
export const RETOOL_HINT_SUSTAIN_FILL = 1 / (1 + DEMAND_PROBE_MARGIN);

/** A suggestion must sell at least this much more of its output value than today. */
export const RETOOL_HINT_MIN_GAIN = 0.15;

type Balance = { supply: number; demand: number };

export interface RetoolHint {
  currentStrategyId: string;
  /** Which record the plant's sales were read from. */
  salesSource: "settlement" | "clearing";
  /**
   * The current output's most valuable product: its share of output value, the
   * share of what the plant offered that sold, and the share of everything on
   * offer in its market that had no buyer, per the latest market book.
   */
  currentMain: {
    commodity: CommodityType;
    valueShare: number;
    fill: number;
    marketSurplusShare: number;
  };
  /** Share of the current output's value that sold last turn, 0 to 1. */
  currentValueFill: number;
  /** Output last turn over installed capacity, 0 to 1; null when not recorded. */
  runShare: number | null;
  suggestedStrategyId: string;
  suggestedStrategyName: string;
  /** The suggested mix's most valuable output and how short its market is. */
  suggestedMain: { commodity: CommodityType; valueShare: number; unmetShare: number };
  /** Estimated share of the suggested output's value buyers would take, 0 to 1. */
  suggestedValueFill: number;
}

/** The parts of a funded producer settlement (`sector.producerSettlement`) the hint reads. */
export interface RetoolHintSettlement {
  turn: number;
  capacityUnits?: number | null;
  producedUnits?: number | null;
  products?: ReadonlyArray<{
    commodity: string;
    offeredUnits?: number | null;
    soldUnits?: number | null;
    internalDeliveredUnits?: number | null;
    askingUnitPrice?: number | null;
  }> | null;
}

export interface RetoolHintInput {
  currentStrategyId: string;
  /** The current strategy's supply mix, as the engine runs it. */
  currentSupply: Partial<Record<CommodityType, number>>;
  /** Last turn's clearing fill per output (`sector.soldByCommodity`). */
  soldByCommodity: Partial<Record<string, number>> | null | undefined;
  /** Turn the clearing fill was written (`sector.soldByCommodityTurn`). */
  soldByCommodityTurn?: number | null;
  /** The plant's funded settlement, where the world settles plants. */
  settlement?: RetoolHintSettlement | null;
  /** Last turn's demand throttle (`sector.demandThrottleFactor`). */
  demandThrottleFactor: number | null | undefined;
  mothballed: boolean;
  /** A retool already in progress gets no new advice. */
  isTransitioning: boolean;
  /** Units the plant made last turn. */
  producedUnits: number | null | undefined;
  /** Installed capacity, units/day. */
  capacityUnits: number | null | undefined;
  /** Every strategy this sector type has, current included. */
  strategies: readonly SectorStrategy[];
  /** False for strategies the corporation cannot adopt (tech or decade locks). */
  isAvailable: (strategy: SectorStrategy) => boolean;
  /** The supply a strategy would actually yield here (extraction deposit filter). */
  supplyFor?: (strategy: SectorStrategy) => Partial<Record<CommodityType, number>>;
  /** Capacity rescale a retool from the current strategy to `toStrategyId` applies. */
  rescaleRatio: (toStrategyId: string) => number;
  /** Lagged price over base for one commodity in this sector's market. */
  priceRatioFor: (commodity: CommodityType) => number | null | undefined;
  /** This sector's market book for one commodity, lagged. */
  balanceFor: (commodity: CommodityType) => Balance | null | undefined;
  /** Base-price table the plant's units split on (the era ledger table). */
  basePrices: Record<CommodityType, number>;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function legs(supply: Partial<Record<CommodityType, number>>): [CommodityType, number][] {
  return (Object.entries(supply) as [CommodityType, number][]).filter(
    ([, rate]) => finite(rate) && rate > 0
  );
}

function valueWeight(rate: number, ratio: number | null | undefined): number {
  return rate * (finite(ratio) && ratio > 0 ? ratio : 1);
}

type CurrentLeg = { commodity: CommodityType; weight: number; fill: number };

/**
 * The settlement is the paid record, so it wins over a clearing fill of the
 * same turn or older. A clearing fill newer than the settlement means the
 * plant was not settled since, and the two turns are never mixed.
 */
function settlementToRead(input: RetoolHintInput): RetoolHintSettlement | null {
  const settlement = input.settlement;
  if (!settlement || !finite(settlement.turn)) return null;
  if (!(settlement.products ?? []).some((p) => finite(p.offeredUnits) && p.offeredUnits > 0))
    return null;
  const fillTurn = input.soldByCommodityTurn;
  if (input.soldByCommodity && finite(fillTurn) && fillTurn > settlement.turn) return null;
  return settlement;
}

/** Per product: offered value at the plant's ask and the share of offered units taken. */
function settlementLegs(settlement: RetoolHintSettlement, input: RetoolHintInput): CurrentLeg[] {
  const byCommodity = new Map<CommodityType, { offered: number; taken: number; value: number }>();
  for (const p of settlement.products ?? []) {
    const offered = finite(p.offeredUnits) ? Math.max(0, p.offeredUnits) : 0;
    if (!(offered > 0)) continue;
    const commodity = p.commodity as CommodityType;
    // Own-site deliveries found a taker too; only units nobody took went unsold.
    const taken =
      (finite(p.soldUnits) ? Math.max(0, p.soldUnits) : 0) +
      (finite(p.internalDeliveredUnits) ? Math.max(0, p.internalDeliveredUnits) : 0);
    const ratio = input.priceRatioFor(commodity);
    const unitValue =
      finite(p.askingUnitPrice) && p.askingUnitPrice > 0
        ? p.askingUnitPrice
        : (input.basePrices[commodity] ?? 1) * (finite(ratio) && ratio > 0 ? ratio : 1);
    const row = byCommodity.get(commodity) ?? { offered: 0, taken: 0, value: 0 };
    row.offered += offered;
    row.taken += Math.max(0, Math.min(offered, taken));
    row.value += offered * unitValue;
    byCommodity.set(commodity, row);
  }
  return [...byCommodity].map(([commodity, row]) => ({
    commodity,
    weight: row.value,
    fill: row.offered > 0 ? row.taken / row.offered : 0,
  }));
}

function clearingLegs(input: RetoolHintInput): CurrentLeg[] {
  const fills = input.soldByCommodity;
  if (!fills) return [];
  const out: CurrentLeg[] = [];
  for (const [commodity, rate] of legs(input.currentSupply)) {
    const fill = fills[commodity];
    if (!finite(fill)) continue;
    out.push({
      commodity,
      weight: valueWeight(rate, input.priceRatioFor(commodity)),
      fill: Math.max(0, Math.min(1, fill)),
    });
  }
  return out;
}

export function computeRetoolHint(input: RetoolHintInput): RetoolHint | null {
  if (input.mothballed || input.isTransitioning) return null;
  const throttle = input.demandThrottleFactor;
  if (!finite(throttle) || throttle >= 0.999) return null;
  const produced = finite(input.producedUnits) && input.producedUnits > 0 ? input.producedUnits : 0;
  const capacity = finite(input.capacityUnits) && input.capacityUnits > 0 ? input.capacityUnits : 0;
  if (!(capacity > 0)) return null;

  // ── Today: what share of this plant's output value sold ────────────────────
  const settlement = settlementToRead(input);
  const currentLegs = settlement ? settlementLegs(settlement, input) : clearingLegs(input);
  let currentWeight = 0;
  let currentSold = 0;
  let mainLeg: CurrentLeg | null = null;
  for (const leg of currentLegs) {
    if (!(leg.weight > 0)) continue;
    currentWeight += leg.weight;
    currentSold += leg.weight * leg.fill;
    if (!mainLeg || leg.weight > mainLeg.weight) mainLeg = leg;
  }
  if (!mainLeg || !(currentWeight > 0)) return null;
  const currentValueFill = currentSold / currentWeight;
  // A plant whose output sells well enough is already climbing on its own.
  if (currentValueFill >= RETOOL_HINT_SUSTAIN_FILL) return null;

  // The hint is about an oversupplied main product. Where the main product's
  // own market book is not oversupplied, the record cannot support that claim.
  const mainBook = input.balanceFor(mainLeg.commodity);
  const mainSupply = mainBook && finite(mainBook.supply) ? Math.max(0, mainBook.supply) : 0;
  const mainDemand = mainBook && finite(mainBook.demand) ? Math.max(0, mainBook.demand) : 0;
  if (!(mainSupply > mainDemand)) return null;
  const currentMain: RetoolHint["currentMain"] = {
    commodity: mainLeg.commodity,
    valueShare: mainLeg.weight / currentWeight,
    fill: mainLeg.fill,
    marketSurplusShare: (mainSupply - mainDemand) / mainSupply,
  };

  const settledCapacity =
    settlement && finite(settlement.capacityUnits) && settlement.capacityUnits > 0
      ? settlement.capacityUnits
      : 0;
  const runShare = settlement
    ? settledCapacity > 0 && finite(settlement.producedUnits)
      ? Math.max(0, Math.min(1, settlement.producedUnits / settledCapacity))
      : null
    : produced > 0
      ? Math.max(0, Math.min(1, produced / capacity))
      : null;

  // What this plant puts into each book today, so a candidate is not credited
  // with demand the plant is already serving or blamed for its own supply.
  const currentUnits = (commodity: CommodityType): number =>
    produced > 0
      ? produced * commodityMixWeight(input.currentSupply, input.basePrices, commodity)
      : 0;

  // ── Candidates: estimated value fill at full capacity ──────────────────────
  let best: { strategy: SectorStrategy; fill: number; main: RetoolHint["suggestedMain"] } | null =
    null;
  for (const strategy of input.strategies) {
    if (strategy.id === input.currentStrategyId || !input.isAvailable(strategy)) continue;
    const supply = input.supplyFor ? input.supplyFor(strategy) : strategy.supply;
    const candidateLegs = legs(supply);
    if (candidateLegs.length === 0) continue;
    const units = capacity * Math.max(0, input.rescaleRatio(strategy.id));
    let weightSum = 0;
    let soldSum = 0;
    let mainWeight = -1;
    let main: RetoolHint["suggestedMain"] | null = null;
    for (const [commodity, rate] of candidateLegs) {
      const weight = valueWeight(rate, input.priceRatioFor(commodity));
      const book = input.balanceFor(commodity);
      const demand = book && finite(book.demand) ? Math.max(0, book.demand) : 0;
      const otherSupply =
        book && finite(book.supply) ? Math.max(0, book.supply - currentUnits(commodity)) : 0;
      const ownUnits = units * commodityMixWeight(supply, input.basePrices, commodity);
      const offered = otherSupply + ownUnits;
      const fill = offered > 0 ? Math.min(1, demand / offered) : 0;
      weightSum += weight;
      soldSum += weight * fill;
      if (weight > mainWeight) {
        mainWeight = weight;
        const bookSupply = book && finite(book.supply) ? Math.max(0, book.supply) : 0;
        main = {
          commodity,
          valueShare: 0,
          unmetShare: demand > 0 ? Math.max(0, 1 - bookSupply / demand) : 0,
        };
      }
    }
    if (!main || !(weightSum > 0)) continue;
    // Retooling into the same main product cannot fix a main product that is not
    // selling, and the two market readings would contradict each other.
    if (main.commodity === currentMain.commodity) continue;
    main.valueShare = mainWeight / weightSum;
    const fill = soldSum / weightSum;
    if (!best || fill > best.fill) best = { strategy, fill, main };
  }
  if (!best) return null;
  if (best.fill < RETOOL_HINT_SUSTAIN_FILL) return null;
  if (best.fill < currentValueFill + RETOOL_HINT_MIN_GAIN) return null;

  return {
    currentStrategyId: input.currentStrategyId,
    salesSource: settlement ? "settlement" : "clearing",
    currentMain,
    currentValueFill,
    runShare,
    suggestedStrategyId: best.strategy.id,
    suggestedStrategyName: best.strategy.name,
    suggestedMain: best.main,
    suggestedValueFill: best.fill,
  };
}
