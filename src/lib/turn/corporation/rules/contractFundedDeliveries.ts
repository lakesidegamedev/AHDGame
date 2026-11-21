/**
 * What the funded market delivered under each supply agreement.
 *
 * Plain data in, plain data out: no clock, rng or ambient state.
 *
 * "Delivered under this contract" means: units the funded settlement recorded
 * as sold by the contract's supplier to the contract's buyer, of the contract's
 * commodity, in the settled turn. Own-site transfers never count, and neither
 * do sales to or from anyone else. For a state-scoped contract only sales from
 * the supplier's plants in the contract's state count. The funded market does
 * not route goods because of a contract, so this is the pair's real trade,
 * whatever made the market match it.
 *
 * Funded trades are per-turn units; contract volumes are on the daily basis,
 * so a pair's trade is scaled by turns per day before it is compared with a
 * volume cap.
 *
 * When one supplier holds several contracts with the same buyer for the same
 * commodity, the pair's delivery is split between them in proportion to their
 * volume caps, and no contract is credited more than its own cap. State-scoped
 * contracts are credited first from sales in their state; corporation-wide
 * contracts for the same pair then share what is left of the pair's total, so
 * no unit is credited twice.
 */

import { producerTrades, type ProducerTradeReceipt } from "@/lib/market/producerMarket/rules";

/** One settled supplier-level trade, as replayed from the funded receipt. */
export interface FundedContractTrade {
  kind: string;
  sellerAccountId: string;
  buyerAccountId: string;
  commodity: string;
  units: number;
  /** State of the selling plant, when known. */
  sellerStateId?: string | null;
}

/**
 * Per-turn funded units by (supplier, buyer, scope key). The bare commodity
 * key holds the pair's total; `commodity@state` holds sales from the
 * supplier's plants in that state.
 */
export type FundedPairFlows = ReadonlyMap<string, number>;

export function fundedPairFlowKey(
  supplierCorpId: string,
  buyerCorpId: string,
  scopeKey: string
): string {
  return JSON.stringify([supplierCorpId, buyerCorpId, scopeKey]);
}

/** The supplier-level trades of a settled funded receipt, with each seller's plant state. */
export function* fundedContractTradesOf(
  receipt: ProducerTradeReceipt
): Generator<FundedContractTrade> {
  const stateByOffer = new Map(receipt.offers.map((o) => [o.id, o.stateId]));
  for (const t of producerTrades(receipt)) {
    yield {
      kind: t.kind,
      sellerAccountId: t.sellerAccountId,
      buyerAccountId: t.buyerAccountId,
      commodity: t.commodity,
      units: t.units,
      sellerStateId: stateByOffer.get(t.offerId) ?? null,
    };
  }
}

/**
 * Sums the settled sales between distinct companies. With `pairs`, only
 * (supplier, buyer, commodity) triples in the set are kept, keyed by
 * {@link fundedPairFlowKey} with the bare commodity as scope.
 */
export function fundedPairFlows(
  trades: Iterable<FundedContractTrade>,
  pairs?: ReadonlySet<string>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of trades) {
    if (t.kind !== "sale" || t.sellerAccountId === t.buyerAccountId) continue;
    if (!(Number.isFinite(t.units) && t.units > 0)) continue;
    const total = fundedPairFlowKey(t.sellerAccountId, t.buyerAccountId, t.commodity);
    if (pairs && !pairs.has(total)) continue;
    out.set(total, (out.get(total) ?? 0) + t.units);
    if (t.sellerStateId) {
      const local = fundedPairFlowKey(
        t.sellerAccountId,
        t.buyerAccountId,
        `${t.commodity}@${t.sellerStateId}`
      );
      out.set(local, (out.get(local) ?? 0) + t.units);
    }
  }
  return out;
}

export interface FundedDeliveryAgreement {
  supplierCorpId: string;
  buyerCorpId: string;
  commodity: string;
  stateId?: string;
  /** Daily-basis contracted units. */
  volumeCap: number;
}

/** The (supplier, buyer, commodity) keys a set of agreements needs from the flows. */
export function fundedPairKeysOf(agreements: readonly FundedDeliveryAgreement[]): Set<string> {
  return new Set(
    agreements.map((a) => fundedPairFlowKey(a.supplierCorpId, a.buyerCorpId, a.commodity))
  );
}

function creditByCap(
  indices: readonly number[],
  agreements: readonly FundedDeliveryAgreement[],
  poolUnits: number,
  out: Map<number, number>
): number {
  const caps = indices.map((i) => Math.max(0, agreements[i]!.volumeCap));
  const totalCap = caps.reduce((sum, cap) => sum + cap, 0);
  let credited = 0;
  for (let k = 0; k < indices.length; k++) {
    const units =
      totalCap > 0 && poolUnits > 0 ? Math.min(caps[k]!, (poolUnits * caps[k]!) / totalCap) : 0;
    out.set(indices[k]!, units);
    credited += units;
  }
  return credited;
}

/**
 * Daily-basis units credited to each agreement, by its index in `agreements`.
 * Every agreement gets an entry; one whose pair did not trade gets 0.
 */
export function fundedContractDeliveries(args: {
  agreements: readonly FundedDeliveryAgreement[];
  flows: FundedPairFlows;
  turnsPerDay: number;
}): Map<number, number> {
  const { agreements, flows, turnsPerDay } = args;
  const byPair = new Map<string, { local: Map<string, number[]>; wide: number[] }>();
  for (let i = 0; i < agreements.length; i++) {
    const a = agreements[i]!;
    const pair = fundedPairFlowKey(a.supplierCorpId, a.buyerCorpId, a.commodity);
    const group = byPair.get(pair) ?? { local: new Map<string, number[]>(), wide: [] };
    if (a.stateId) {
      const scope = fundedPairFlowKey(
        a.supplierCorpId,
        a.buyerCorpId,
        `${a.commodity}@${a.stateId}`
      );
      group.local.set(scope, [...(group.local.get(scope) ?? []), i]);
    } else {
      group.wide.push(i);
    }
    byPair.set(pair, group);
  }

  const out = new Map<number, number>();
  for (const [pair, group] of byPair) {
    let creditedLocal = 0;
    for (const [scope, indices] of group.local) {
      const pool = Math.max(0, flows.get(scope) ?? 0) * turnsPerDay;
      creditedLocal += creditByCap(indices, agreements, pool, out);
    }
    if (group.wide.length > 0) {
      const total = Math.max(0, flows.get(pair) ?? 0) * turnsPerDay;
      creditByCap(group.wide, agreements, Math.max(0, total - creditedLocal), out);
    }
  }
  return out;
}
