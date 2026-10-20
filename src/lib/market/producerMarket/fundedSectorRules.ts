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
];

export interface FundedReceipt {
  /** Anchor per turn. */
  revenue: number;
  /** Anchor per turn: revenue minus inputs consumed, wages and site bills. */
  profit: number;
  producedUnits: number;
  soldUnits: number;
}

export interface LegacySectorResultLike {
  hourlyRevenue: number;
  effectiveMargin: number;
  costs: number;
  hourlyGrowthCost: number;
  regulatoryBurden?: number;
}

/**
 * Revenue and margin from the receipt. Costs are the receipt's operating costs
 * plus the legacy growth spend and the regulatory compliance cost set by
 * government policy, neither of which the funded market charges itself.
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
    Math.max(0, finite(legacy.regulatoryBurden ?? 0));
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
  daily: (anchorPerTurn: number) => number
): Op[] {
  const owned = new Set(SETTLEMENT_OWNED_SECTOR_FIELDS);
  const out: Op[] = [];
  let stamped = false;
  for (const op of ops) {
    const id = String((op.updateOne.filter as { _id?: unknown })._id ?? "");
    if (id !== sectorId) {
      out.push(op);
      continue;
    }
    const update = op.updateOne.update as Record<string, Record<string, unknown> | undefined>;
    const set = Object.fromEntries(
      Object.entries(update.$set ?? {}).filter(([f]) => !owned.has(rootOf(f)))
    );
    if (!stamped && update.$set) {
      Object.assign(set, {
        realizedRevenue: daily(result.hourlyRevenue),
        producedUnits: Math.round(receipt.producedUnits * 100) / 100,
        soldUnits: Math.round(receipt.soldUnits * 100) / 100,
        effectiveProfitMargin: Math.round(result.effectiveMargin * 100) / 100,
        plantsPnl: {
          revenue: daily(result.hourlyRevenue),
          profit: daily(result.hourlyRevenue - result.costs),
          totalCost: daily(result.costs),
          source: "funded" as const,
        },
      });
      stamped = true;
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

function rootOf(field: string): string {
  const dot = field.indexOf(".");
  return dot < 0 ? field : field.slice(0, dot);
}

function finite(x: number): number {
  return Number.isFinite(x) ? x : 0;
}
