import {
  producerTrades,
  type ProducerTradeReceipt,
} from "@/lib/market/producerMarket/producerQuotes";
import type { SupplyChainFlow, SupplyChainSite } from "../types";

export function producerSiteId(id: string): string | null {
  try {
    const value: unknown = JSON.parse(id);
    if (!Array.isArray(value) || typeof value[0] !== "string") return null;
    if (value[1] === "input" || value[1] === "output") return value[0];
    return producerSiteId(value[0]);
  } catch {
    return null;
  }
}

export function companyFlows(
  receipt: ProducerTradeReceipt,
  companyId: string,
  sites: readonly SupplyChainSite[]
): SupplyChainFlow[] {
  const offers = new Map(receipt.offers.map((o) => [o.id, o]));
  const orders = new Map(receipt.orders.map((o) => [o.id, o]));
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const totals = new Map<string, SupplyChainFlow>();
  for (const trade of producerTrades(receipt, companyId)) {
    const offer = offers.get(trade.offerId)!;
    const order = orders.get(trade.orderId)!;
    const mode =
      trade.kind === "internalTransfer"
        ? "internal"
        : order.supplierOfferId
          ? "agreement"
          : "open-market";
    const legs: {
      direction: SupplyChainFlow["direction"];
      ownId: string;
      otherId: string;
      country?: string;
      state?: string;
    }[] = [];
    if (trade.buyerAccountId === companyId)
      legs.push({
        direction: "suppliers",
        ownId: order.id,
        otherId: offer.accountId,
        country: offer.countryId,
        state: offer.stateId,
      });
    if (trade.sellerAccountId === companyId)
      legs.push({
        direction: "customers",
        ownId: offer.id,
        otherId: order.accountId,
        country: order.countryId,
        state: order.stateId,
      });
    for (const leg of legs) {
      const siteId = producerSiteId(leg.ownId);
      const site = siteId && siteMap.get(siteId);
      if (!site) throw new Error("Missing supply-chain site identity");
      const key = JSON.stringify([
        leg.direction,
        site.id,
        leg.otherId,
        leg.country,
        leg.state,
        trade.commodity,
        mode,
      ]);
      const row = totals.get(key) ?? {
        direction: leg.direction,
        mode,
        site,
        counterpartyId: leg.otherId,
        counterpartyCountry: leg.country ?? "",
        counterpartyState: leg.state ?? "",
        commodity: trade.commodity,
        units: 0,
        amount: 0,
      };
      row.units += trade.units;
      row.amount += trade.amount;
      totals.set(key, row);
    }
  }
  return [...totals.values()];
}
