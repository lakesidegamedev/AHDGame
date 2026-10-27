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

/** Sector fields only the funded settlement writes. */
export const SETTLEMENT_OWNED_SECTOR_FIELDS: readonly string[] = [
  "capitalStock",
  "capacityBookAnchor",
  "buildQueue",
  "plantCount",
  "plantUnitRemainder",
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

export interface FundedReceipt {
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
  regulatoryBurden?: number;
  /** Points of revenue for size costs the margin stack carried (overhead, SOE sprawl, running dominance). */
  fundedSizeCostPp?: number;
}

/**
 * Revenue and margin from the receipt. Costs are the receipt's operating costs
 * plus the legacy growth spend, the regulatory compliance cost set by
 * government policy, and the size costs (overhead, state sprawl, running
 * dominance) as points of revenue; the funded market charges none of these itself.
 */
export function fundedSectorResult<T extends LegacySectorResultLike>(
  legacy: T,
  r: FundedReceipt
): T {
  const revenue = Math.max(0, finite(r.revenue));
  const producerCosts = Math.max(0, revenue - finite(r.profit));
  const costs =
    producerCosts +
    Math.max(0, finite(legacy.hourlyGrowthCost)) +
    Math.max(0, finite(legacy.regulatoryBurden ?? 0)) +
    (revenue * Math.max(0, finite(legacy.fundedSizeCostPp ?? 0))) / 100;
  return {
    ...legacy,
    hourlyRevenue: revenue,
    costs,
    effectiveMargin: revenue > 0 ? ((revenue - costs) / revenue) * 100 : 0,
  };
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
        realizedRevenue: daily(result.hourlyRevenue),
        producedUnits: Math.round(receipt.producedUnits * turnsPerDay * 100) / 100,
        soldUnits: Math.round(receipt.soldUnits * turnsPerDay * 100) / 100,
        effectiveProfitMargin: Math.round(result.effectiveMargin * 100) / 100,
        plantsPnl: {
          revenue: daily(result.hourlyRevenue),
          profit: daily(result.hourlyRevenue - result.costs),
          totalCost: daily(result.costs),
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
 * Funded demand throttle: the share of its per-turn operating capacity that the
 * plant actually sold, clamped to [0, 1], 1 when it could produce nothing. The
 * legacy clearing pass is the only other writer of `demandThrottleFactor`, and a
 * funded turn never prices its market, so the funded settlement publishes its
 * own reading; AI placement and mothballing read it as saturation.
 *
 * Clamped, since a multi-leg plant's sold units and the capacity basis are both
 * per-turn unit totals and can round past each other.
 */
export function fundedDemandThrottle(
  soldUnits: number | null | undefined,
  capacityUnits: number | null | undefined
): number {
  const capacity = finite(capacityUnits);
  if (!(capacity > 0)) return 1;
  return Math.max(0, Math.min(1, finite(soldUnits) / capacity));
}

function rootOf(field: string): string {
  const dot = field.indexOf(".");
  return dot < 0 ? field : field.slice(0, dot);
}

function finite(x: number): number {
  return Number.isFinite(x) ? x : 0;
}
