/**
 * Own-group sourcing turn context. Uses current full economic ownership and
 * the same physical input demand basis as supply agreements, without new reads.
 */
import {
  computeSupplyAgreementSectorDemand,
  type SupplyAgreementDemandSector,
  type SettleableSupplyAgreement,
} from "./settleSupplyAgreements";
import { resolveSupplyPolicies } from "@/lib/market/internalSupply/rules";
import type { InternalSupplyClearing } from "@/lib/market/internalSupply/clearing";
import type { CorporationLookups } from "./types";
import type { MarketContext } from "@/lib/market/marketContext";
import type { CommodityType } from "@/lib/constants/commodities";
import { isStateScopedCommodity } from "@/lib/market/commodityMarketScope";

interface InternalSupplyBuyer {
  sectorId: string;
  corporationId: string;
  stateId?: string;
  demand: Map<CommodityType, number>;
  committed: Map<CommodityType, number>;
  availability?: Map<CommodityType, number>;
}

export function buildInternalSupplyContext(args: {
  lookups: CorporationLookups;
  market: MarketContext;
  sectors: readonly (SupplyAgreementDemandSector & { sectorId: string })[];
  agreements: readonly SettleableSupplyAgreement[];
  turn: number;
  freightSettlementActive?: boolean;
  /** Restrict own-group reservations to these commodity books (see InternalSupplyClearing). */
  reserveCommodities?: ReadonlySet<CommodityType>;
}): InternalSupplyClearing | undefined {
  if (!args.market.plantsEnabled || !args.market.clearingEnabled) return undefined;
  const owners = [...args.lookups.corpById].map(([id, c]) => ({
    id,
    totalShares: c.totalShares,
    holders: (c.shareholders ?? []).map((h) => ({
      corporationId: h.corporationId?.toString(),
      shares: h.shares,
    })),
    policy: c.internalSupplyPolicy,
  }));
  const policies = resolveSupplyPolicies(owners);
  let anyPriority = false;
  for (const policy of policies.values())
    if (policy.policy.priority !== "market") {
      anyPriority = true;
      break;
    }
  if (!anyPriority) return undefined;
  const buyers: InternalSupplyBuyer[] = [];
  // Explicit promises claim their buyers' physical demand first. Splitting
  // across consuming plants prevents priority from reserving the same demand.
  // Indexed by corporation so each agreement scans only its buyer's sectors
  // instead of every sector in the world.
  const buyersByCorpId = new Map<string, InternalSupplyBuyer[]>();
  for (const s of args.sectors) {
    const buyer: InternalSupplyBuyer = {
      sectorId: s.sectorId,
      corporationId: s.corporationId,
      stateId: s.stateId,
      demand: computeSupplyAgreementSectorDemand({
        preset: args.lookups.preset,
        hardwareInputReliefStartTurn: args.lookups.hardwareInputReliefStartTurn,
        sector: s,
        currentTurn: args.turn,
        unitScale: args.lookups.eraUnitScale,
        plantsEnabled: true,
      }),
      committed: new Map<CommodityType, number>(),
      availability: args.lookups.stateInputAvailabilityByState.get(s.stateId ?? ""),
    };
    buyers.push(buyer);
    const rows = buyersByCorpId.get(buyer.corporationId);
    if (rows) rows.push(buyer);
    else buyersByCorpId.set(buyer.corporationId, [buyer]);
  }
  for (const a of args.agreements) {
    const corpBuyers = buyersByCorpId.get(a.buyerCorpId);
    if (!corpBuyers) continue;
    const eligible = corpBuyers.filter(
      (b) => !isStateScopedCommodity(a.commodity) || !a.stateId || b.stateId === a.stateId
    );
    const remaining = eligible.map((b) =>
      Math.max(0, (b.demand.get(a.commodity) ?? 0) - (b.committed.get(a.commodity) ?? 0))
    );
    const total = remaining.reduce((n, u) => n + u, 0);
    const take = Math.min(total, Math.max(0, a.volumeCap));
    if (!(take > 0)) continue;
    eligible.forEach((b, i) =>
      b.committed.set(
        a.commodity,
        (b.committed.get(a.commodity) ?? 0) + (take * remaining[i]!) / total
      )
    );
  }
  const availabilityOut = new Map<string, Map<CommodityType, number>>();
  const discountCostOut = new Map<string, number>();
  args.market.internalInputAvailabilityBySectorId = availabilityOut;
  args.market.internalSupplyDiscountCostBySectorId = discountCostOut;
  return {
    ...(args.reserveCommodities ? { reserveCommodities: args.reserveCommodities } : {}),
    policies,
    buyers,
    availabilityOut,
    discountCostOut,
    tradesOut: [],
    deliveryStateBySector: args.freightSettlementActive
      ? deliveryStateBySector(args.sectors)
      : undefined,
    ownRouteDeliveredByKey: args.freightSettlementActive
      ? args.lookups.ownRouteDeliveredByKey
      : undefined,
  };
}

/** Persist only actual deliveries, with empty current receipts clearing old results. */
export function finishInternalSupplyContext(
  context: InternalSupplyClearing | undefined,
  market: MarketContext,
  turn: number
): void {
  if (!context) return;
  const receipts = new Map<
    string,
    {
      turn: number;
      received: Partial<Record<CommodityType, number>>;
      reserved: Partial<Record<CommodityType, number>>;
    }
  >();
  for (const buyer of context.buyers)
    receipts.set(buyer.sectorId, { turn, received: {}, reserved: {} });
  for (const trade of context.tradesOut) {
    const seller = receipts.get(trade.supplierSectorId) ?? { turn, received: {}, reserved: {} };
    seller.reserved[trade.commodity] = (seller.reserved[trade.commodity] ?? 0) + trade.units;
    receipts.set(trade.supplierSectorId, seller);
    const buyer = receipts.get(trade.buyerSectorId) ?? { turn, received: {}, reserved: {} };
    buyer.received[trade.commodity] = (buyer.received[trade.commodity] ?? 0) + trade.units;
    receipts.set(trade.buyerSectorId, buyer);
  }
  market.internalSupplyReceiptsBySectorId = receipts;
  market.internalSupplyCommittedInputsBySectorId = new Map(
    context.buyers.map((b) => [b.sectorId, b.committed ?? new Map()])
  );
  market.internalSupplyTrades = (context.pendingBooks ?? []).flatMap((book) =>
    context.tradesOut
      .filter(
        (t) =>
          t.commodity === book.commodity &&
          book.trades.some(
            (original) =>
              original.supplierSectorId === t.supplierSectorId &&
              original.buyerSectorId === t.buyerSectorId
          )
      )
      .map((t) => ({ ...t, marketPrice: book.marketPrice }))
  );
}

function deliveryStateBySector(
  sectors: readonly { sectorId: string; stateId?: string }[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const sector of sectors) if (sector.stateId) out.set(sector.sectorId, sector.stateId);
  return out;
}
