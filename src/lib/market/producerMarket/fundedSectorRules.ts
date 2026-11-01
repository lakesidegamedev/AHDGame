/**
 * Funded producer turn: how one settled receipt replaces the legacy sector
 * result (funded-market cutover, phase B slice S3).
 *
 * The funded settlement has already moved the cash (sales in; wages, site bills
 * and input purchases out) and written each plant's physical state. The legacy
 * per-sector pass still runs for everything the settlement does not own
 * (labour telemetry, growth, valuation inputs), but on a funded turn:
 * - revenue, margin and costs come from the receipt;
 * - fields the settlement owns, and the legacy inventory, are never written;
 * - build-queue and capacity side ops are dropped;
 * - the corporation's cash credit excludes the producer profit the settlement
 *   already paid.
 *
 * It also publishes the funded demand throttle (`fundedDemandThrottle`): the
 * legacy clearing pass is its other writer and a funded turn never prices that
 * market, so AI saturation would otherwise read a stale value.
 *
 * Pure: plain data in, plain data out.
 */

import {
  fundedSalesTelemetry,
  type FundedSalesReceipt,
} from "@/lib/corporations/rules/fundedReporting";

/** Sector fields only the funded settlement writes. */
export const SETTLEMENT_OWNED_SECTOR_FIELDS: readonly string[] = [
  "capitalStock",
  "capacityBookAnchor",
  "buildQueue",
  "plantCount",
  "plantUnitRemainder",
  "plantWearUnits",
  "constructionInProgressAnchor",
  "producerCapacity",
  "producerInventory",
  "producerSettlement",
  "producerQuotes",
  // Legacy finished-goods inventory; the funded world keeps stock in producerInventory.
  "inventoryUnits",
  // Written from the funded receipt: the legacy throttle reads a market the
  // funded turn never priced, and would overwrite the funded reading.
  "demandThrottleFactor",
];

export interface FundedReceipt extends FundedSalesReceipt {
  /** Anchor per turn. */
  revenue: number;
  /** Anchor per turn: revenue minus inputs consumed, wages and site bills. */
  profit: number;
  producedUnits: number;
  soldUnits: number;
  /** Anchor per turn: inputs in output that went to stock unsold (inventory at cost). */
  unsoldProductionCost?: number;
  /** Anchor per turn: transition floor support this sector received. */
  transitionSupport?: number;
}

export interface LegacySectorResultLike {
  hourlyRevenue: number;
  effectiveMargin: number;
  costs: number;
  hourlyGrowthCost: number;
  /** Legacy pass compliance cost, on the legacy pass's revenue. Not charged on a funded turn. */
  regulatoryBurden?: number;
  /** Points of revenue for size costs the margin stack carried (overhead, SOE sprawl, running dominance). */
  fundedSizeCostPp?: number;
  /** Compliance rate (share of revenue) charged on the funded revenue. */
  fundedRegulatoryBurdenRate?: number;
  /** Growth cost at full realization; the funded turn realizes it against funded revenue. */
  nameplateHourlyGrowthCost?: number;
  nameplateHourlyRevenue?: number;
  growthInvestmentAnchor?: number;
  /** Dominance margin penalty (pp, negative) the funded turn applied. */
  fundedDominancePenaltyPp?: number;
  /** Compliance cost inside `costs` on a funded turn (set by `fundedSectorResult`). */
  fundedComplianceCost?: number;
}

/**
 * Revenue and margin from the receipt. Costs are the receipt's operating costs
 * plus the growth spend, the regulatory compliance cost and the size costs
 * (overhead, state sprawl, running dominance) as points of revenue; the funded
 * market charges none of these itself.
 *
 * Every leg is measured on the revenue the plant sold. The legacy pass priced
 * compliance and growth on its own revenue, which on a funded turn is a
 * different, often much larger, number.
 */
export function fundedSectorResult<T extends LegacySectorResultLike>(
  legacy: T,
  r: FundedReceipt
): T {
  const revenue = Math.max(0, finite(r.revenue));
  const producerCosts = Math.max(0, revenue - finite(r.profit));
  const growthCost = fundedGrowthCost(legacy, revenue);
  const compliance = revenue * Math.max(0, finite(legacy.fundedRegulatoryBurdenRate ?? 0));
  const costs =
    producerCosts +
    growthCost +
    compliance +
    (revenue * Math.max(0, finite(legacy.fundedSizeCostPp ?? 0))) / 100;
  return {
    ...legacy,
    hourlyRevenue: revenue,
    hourlyGrowthCost: growthCost,
    ...(legacy.growthInvestmentAnchor !== undefined
      ? { growthInvestmentAnchor: legacy.growthInvestmentAnchor > 0 ? growthCost : 0 }
      : {}),
    regulatoryBurden: compliance,
    fundedComplianceCost: compliance,
    costs,
    effectiveMargin: revenue > 0 ? ((revenue - costs) / revenue) * 100 : 0,
  };
}

/** Growth cost realized against the funded revenue instead of the legacy pass's. */
function fundedGrowthCost(legacy: LegacySectorResultLike, revenue: number): number {
  const legacyCost = Math.max(0, finite(legacy.hourlyGrowthCost));
  const full = legacy.nameplateHourlyGrowthCost;
  if (full === undefined) return legacyCost;
  const nameplate = finite(legacy.nameplateHourlyRevenue ?? 0);
  const realization = nameplate > 0 ? Math.max(0, Math.min(1, revenue / nameplate)) : 1;
  return Math.max(0, finite(full)) * realization;
}

type Op = { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } };

/**
 * Keeps the legacy sector ops for one sector minus everything the settlement
 * owns, and stamps realized revenue, units and margin from the receipt.
 * `daily` converts anchor-per-turn into the sector's stored daily local value.
 */
export function fundedSectorOps(
  ops: readonly Op[],
  sectorId: string,
  receipt: FundedReceipt,
  result: LegacySectorResultLike,
  daily: (anchorPerTurn: number) => number,
  /** Turns per day: receipt units are per turn, the sector fields are daily. */
  turnsPerDay: number
): Op[] {
  return fundedSectorOpsAll(ops, new Map([[sectorId, { receipt, result, daily }]]), turnsPerDay);
}

/**
 * Every funded sector's writes in one pass over the turn's sector ops. Running
 * the single-sector form once per sector rescanned and rebuilt the whole op
 * list each time, quadratic in the world's sector count.
 */
export function fundedSectorOpsAll(
  ops: readonly Op[],
  funded: ReadonlyMap<
    string,
    {
      receipt: FundedReceipt;
      result: LegacySectorResultLike;
      daily: (anchorPerTurn: number) => number;
    }
  >,
  /** Turns per day: receipt units are per turn, the sector fields are daily. */
  turnsPerDay: number
): Op[] {
  const owned = new Set(SETTLEMENT_OWNED_SECTOR_FIELDS);
  const out: Op[] = [];
  const stamped = new Set<string>();
  for (const op of ops) {
    const id = String((op.updateOne.filter as { _id?: unknown })._id ?? "");
    const entry = funded.get(id);
    if (!entry) {
      out.push(op);
      continue;
    }
    const { receipt, result, daily } = entry;
    const update = op.updateOne.update as Record<string, Record<string, unknown> | undefined>;
    const set = Object.fromEntries(
      Object.entries(update.$set ?? {}).filter(([f]) => !owned.has(rootOf(f)))
    );
    if (!stamped.has(id) && update.$set) {
      Object.assign(set, {
        ...fundedSalesTelemetry(receipt),
        realizedRevenue: daily(result.hourlyRevenue),
        producedUnits: Math.round(receipt.producedUnits * turnsPerDay * 100) / 100,
        soldUnits: Math.round(receipt.soldUnits * turnsPerDay * 100) / 100,
        effectiveProfitMargin: Math.round(result.effectiveMargin * 100) / 100,
        // The legacy pass recorded its own (ramp-faded) penalty; show what this turn charged.
        ...(result.fundedDominancePenaltyPp !== undefined
          ? {
              dominanceMarginPenaltyPp: Math.round(result.fundedDominancePenaltyPp * 100) / 100,
            }
          : {}),
        plantsPnl: {
          revenue: daily(result.hourlyRevenue),
          profit: daily(result.hourlyRevenue - result.costs),
          totalCost: daily(result.costs),
          // Dominance compliance, part of totalCost, shown on its own line.
          compliance: daily(result.fundedComplianceCost ?? 0),
          source: "funded" as const,
          // Shown to the owner beside profit; decisions keep reading profit.
          stockAddedAtCost: daily(receipt.unsoldProductionCost ?? 0),
          transitionSupport: daily(receipt.transitionSupport ?? 0),
        },
      });
      stamped.add(id);
    }
    // Other operators ($pull / $push on buildQueue and similar) keep only fields
    // the settlement does not own; an operator left empty is dropped.
    const rest: Record<string, Record<string, unknown>> = {};
    for (const [operator, fields] of Object.entries(update)) {
      if (operator === "$set" || !fields) continue;
      const kept = Object.fromEntries(
        Object.entries(fields).filter(([f]) => !owned.has(rootOf(f)))
      );
      if (Object.keys(kept).length > 0) rest[operator] = kept;
    }
    if (Object.keys(set).length === 0 && Object.keys(rest).length === 0) continue;
    out.push({
      updateOne: {
        filter: op.updateOne.filter,
        update: { ...rest, ...(Object.keys(set).length > 0 ? { $set: set } : {}) },
      },
    });
  }
  return out;
}

/**
 * The legacy corporation income credits revenue minus costs as cash. On a
 * funded turn the settlement already paid the producer part, so only the rest
 * (taxes, interest, dividends, growth and other corporation-level flows) is
 * credited here.
 */
export function fundedCashIncome(legacyIncome: number, settledProducerProfit: number): number {
  return finite(legacyIncome) - finite(settledProducerProfit);
}

/**
 * Funded demand throttle: the share of what the plant put up for sale (this
 * turn's output plus carried stock) that found a buyer, clamped to [0, 1], 1
 * when it offered nothing. The legacy clearing pass is the only other writer of
 * `demandThrottleFactor`, and a funded turn never prices its market, so the
 * funded settlement publishes its own reading; AI placement, mothballing, the
 * retool hint and the sector page read it as a demand signal.
 *
 * Sell-through, not sold over capacity: a plant short of inputs or cash that
 * sells every unit it makes has no demand problem, and read against capacity
 * it showed as "Demand limited" (ticket 1728). The same reading NPP decisions
 * take from the receipt (`fundedSellThrough`).
 */
export function fundedDemandThrottle(
  soldUnits: number | null | undefined,
  offeredUnits: number | null | undefined
): number {
  const offered = finite(offeredUnits ?? 0);
  if (!(offered > 0)) return 1;
  return Math.max(0, Math.min(1, finite(soldUnits ?? 0) / offered));
}

function rootOf(field: string): string {
  const dot = field.indexOf(".");
  return dot < 0 ? field : field.slice(0, dot);
}

function finite(x: number): number {
  return Number.isFinite(x) ? x : 0;
}
