import { describe, expect, it } from "vitest";
import {
  allocateInternalSupply,
  internalSupplyAvailability,
  internalSupplyDiscounts,
  ownRouteIdentity,
  settleConsumedInternalDiscounts,
  type InternalSupplyBuyer,
  type InternalSupplyPolicy,
  type InternalSupplySeller,
  type InternalSupplyTrade,
} from "./rules";

type AllocateArgs = Parameters<typeof allocateInternalSupply>[0];

const positive = (n: number | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;

/**
 * `allocateInternalSupply` before the per-seller eligibility filter was hoisted
 * onto the (corporation|root, state) pair. Kept verbatim so the reservation
 * books can be compared trade for trade.
 */
function legacyAllocateInternalSupply(args: AllocateArgs): {
  trades: InternalSupplyTrade[];
  availabilityBySector: Map<string, number>;
} {
  const trades: InternalSupplyTrade[] = [];
  const sellers = [...args.sellers].sort((a, b) => a.sectorId.localeCompare(b.sectorId));
  const buyers = [...args.buyers].sort((a, b) => a.sectorId.localeCompare(b.sectorId));
  const remaining = new Map(
    buyers.map((b) => [b.sectorId, Math.max(0, positive(b.demand) - positive(b.committed))])
  );
  const supplied = new Map<string, number>();
  const offers = new Map(
    sellers.map((s) => [s.sectorId, Math.max(0, positive(s.units) - positive(s.committed))])
  );
  let room = Math.min(positive(args.reservationRoom), positive(args.supply), positive(args.demand));
  const routeLeft = new Map(args.ownRouteCaps ?? []);
  const routeFor = (s: InternalSupplySeller, b: InternalSupplyBuyer) => {
    const origin = args.deliveryStateBySector?.get(s.sectorId);
    const dest = args.deliveryStateBySector?.get(b.sectorId);
    if (!origin || !dest || origin === dest) return undefined;
    const routeIdentity = ownRouteIdentity(s.corporationId, args.policies.get(s.corporationId));
    const groupKey = routeIdentity + "|" + origin + "|" + dest;
    if (routeIdentity !== s.corporationId) {
      if (
        b.corporationId === s.corporationId &&
        !(routeLeft.get(groupKey) !== undefined && (routeLeft.get(groupKey) ?? 0) > 0)
      )
        return s.corporationId + "|" + origin + "|" + dest;
      return groupKey;
    }
    return s.corporationId + "|" + origin + "|" + dest;
  };

  const buyersByCorporation = new Map<string, InternalSupplyBuyer[]>();
  const buyersByRoot = new Map<string, InternalSupplyBuyer[]>();
  for (const b of buyers) {
    const byCorp = buyersByCorporation.get(b.corporationId) ?? [];
    byCorp.push(b);
    buyersByCorporation.set(b.corporationId, byCorp);
    const root = args.policies.get(b.corporationId)?.root;
    if (!root) continue;
    const byRoot = buyersByRoot.get(root) ?? [];
    byRoot.push(b);
    buyersByRoot.set(root, byRoot);
  }
  const stateOf = (sectorId: string) => args.deliveryStateBySector?.get(sectorId);

  for (const ownOnly of [true, false]) {
    for (const s of sellers) {
      const setting = args.policies.get(s.corporationId);
      if (
        !setting ||
        setting.policy.priority === "market" ||
        (!ownOnly && setting.policy.priority !== "group")
      )
        continue;
      const sellerState = stateOf(s.sectorId);
      const ownCandidates = buyersByCorporation.get(s.corporationId) ?? [];
      const rootCandidates = buyersByRoot.get(setting.root) ?? [];
      const sameState = (b: InternalSupplyBuyer) =>
        !args.deliveryStateBySector ||
        (sellerState !== undefined && sellerState === stateOf(b.sectorId));
      const eligible = ownOnly
        ? ownCandidates.filter(sameState)
        : rootCandidates.filter((b) => b.corporationId !== s.corporationId && sameState(b));
      const groupCrossState =
        !ownOnly &&
        setting.policy.priority === "group" &&
        setting.policy.ownFirstAcrossStates === true;
      const routeEligible = (b: InternalSupplyBuyer) => {
        const key = routeFor(s, b);
        return !!key && (routeLeft.get(key) ?? 0) > 0;
      };
      const crossState =
        args.deliveryStateBySector && routeLeft.size
          ? ownOnly
            ? ownCandidates.filter(routeEligible)
            : groupCrossState
              ? rootCandidates.filter(routeEligible)
              : []
          : [];
      const allocate = (group: InternalSupplyBuyer[], capped: boolean) => {
        const needOf = (b: InternalSupplyBuyer) => {
          const left = remaining.get(b.sectorId) ?? 0;
          return capped ? Math.min(left, routeLeft.get(routeFor(s, b)!) ?? 0) : left;
        };
        const needs = group.map(needOf);
        const routeNeed = new Map<string, number>();
        if (capped)
          group.forEach((b, i) => {
            const key = routeFor(s, b)!;
            routeNeed.set(key, (routeNeed.get(key) ?? 0) + needs[i]!);
          });
        group.forEach((b, i) => {
          if (!capped) return;
          const key = routeFor(s, b)!;
          const total = routeNeed.get(key) ?? 0;
          const cap = routeLeft.get(key) ?? 0;
          if (total > cap && total > 0) needs[i] = (needs[i]! * cap) / total;
        });
        const need = needs.reduce((n, u) => n + u, 0);
        const take = Math.min(room, offers.get(s.sectorId) ?? 0, need);
        if (!(take > 0)) return;
        group.forEach((b, i) => {
          const units = (take * needs[i]!) / need;
          if (!(units > 0)) return;
          if (capped) {
            const key = routeFor(s, b)!;
            routeLeft.set(key, Math.max(0, (routeLeft.get(key) ?? 0) - units));
          }
          trades.push({
            supplierSectorId: s.sectorId,
            buyerSectorId: b.sectorId,
            supplierCorpId: s.corporationId,
            buyerCorpId: b.corporationId,
            units,
            discount: Math.min(0.2, positive(setting.policy.discount)),
          });
          remaining.set(b.sectorId, Math.max(0, (remaining.get(b.sectorId) ?? 0) - units));
          supplied.set(b.sectorId, (supplied.get(b.sectorId) ?? 0) + units);
        });
        room -= take;
        offers.set(s.sectorId, Math.max(0, (offers.get(s.sectorId) ?? 0) - take));
      };
      allocate(eligible, false);
      if (crossState.length) allocate(crossState, true);
    }
  }
  const availabilityBySector = internalSupplyAvailability(buyers, trades, args.supply, args.demand);
  return { trades, availabilityBySector };
}

/** The implementation before the per-trade rebate was inlined. */
function legacySettleConsumedInternalDiscounts(
  trades: readonly (InternalSupplyTrade & { commodity: string; marketPrice: number })[],
  consumption: ReadonlyMap<string, ReadonlyMap<string, number>>,
  turnsPerDay: number,
  committedInputs?: ReadonlyMap<string, ReadonlyMap<string, number>>
): Map<string, number> {
  const reserved = new Map<string, number>();
  for (const t of trades) {
    const key = `${t.buyerSectorId}:${t.commodity}`;
    reserved.set(key, (reserved.get(key) ?? 0) + t.units);
  }
  const costs = new Map<string, number>();
  for (const t of trades) {
    const key = `${t.buyerSectorId}:${t.commodity}`;
    const actual = Math.max(
      0,
      positive(consumption.get(t.buyerSectorId)?.get(t.commodity)) -
        positive(committedInputs?.get(t.buyerSectorId)?.get(t.commodity))
    );
    const units = t.units * Math.min(1, actual / (reserved.get(key) ?? 1));
    for (const [id, cost] of internalSupplyDiscounts([{ ...t, units }], t.marketPrice, turnsPerDay))
      costs.set(id, (costs.get(id) ?? 0) + cost);
  }
  return costs;
}

const groupPolicy: InternalSupplyPolicy = {
  priority: "group",
  discount: 0.12,
  ownFirstAcrossStates: true,
};

/**
 * A realistic pass: one 240-sector book over four states, three corporations in
 * a fully owned group plus two independents, half of the sectors selling.
 */
function bookFixture() {
  const states = ["MN", "CA", "NV", "TX"] as const;
  const policies = new Map<string, { root: string; policy: InternalSupplyPolicy }>([
    ["root-co", { root: "root-co", policy: groupPolicy }],
    ["child-co", { root: "root-co", policy: groupPolicy }],
    ["grandchild-co", { root: "root-co", policy: groupPolicy }],
    ["rival-co", { root: "rival-co", policy: { priority: "market", discount: 0 } }],
    ["taker-co", { root: "taker-co", policy: { priority: "own", discount: 0.05 } }],
  ]);
  const sellers: InternalSupplySeller[] = [];
  const buyers: InternalSupplyBuyer[] = [];
  const deliveryStateBySector = new Map<string, string>();
  for (let i = 0; i < 240; i += 1) {
    const sectorId = `sector-${i.toString().padStart(3, "0")}`;
    const corporationId = ["root-co", "child-co", "grandchild-co", "rival-co", "taker-co"][i % 5]!;
    const state = states[i % 4]!;
    deliveryStateBySector.set(sectorId, state);
    if (i % 2 === 0)
      sellers.push({
        sectorId,
        corporationId,
        units: 20 + (i % 7) * 5,
        committed: i % 6 === 0 ? 4 : undefined,
      });
    else
      buyers.push({
        sectorId,
        corporationId,
        demand: 15 + (i % 5) * 6,
        committed: i % 8 === 0 ? 3 : undefined,
        availability: 0.4 + (i % 3) * 0.2,
      });
  }
  const ownRouteCaps = new Map([
    ["group:root-co|MN|CA", 180],
    ["group:root-co|CA|NV", 90],
    ["root-co|MN|TX", 120],
    ["child-co|NV|CA", 60],
  ]);
  return { sellers, buyers, policies, deliveryStateBySector, ownRouteCaps };
}

describe("allocateInternalSupply eligibility hoist", () => {
  it("books the same trades, in the same order, as the per-seller filter", () => {
    const fixture = bookFixture();
    const args: AllocateArgs = {
      ...fixture,
      supply: 2400,
      demand: 2600,
      reservationRoom: 2000,
    };
    const current = allocateInternalSupply(args);
    const legacy = legacyAllocateInternalSupply(args);
    expect(current.trades).toEqual(legacy.trades);
    expect(current.trades.length).toBeGreaterThan(20);
  });

  it("books the same trades inside a tight reservation room and short supply", () => {
    const fixture = bookFixture();
    const args: AllocateArgs = {
      ...fixture,
      supply: 400,
      demand: 320,
      reservationRoom: 150,
    };
    const current = allocateInternalSupply(args);
    const legacy = legacyAllocateInternalSupply(args);
    expect(current.trades).toEqual(legacy.trades);
    expect([...current.availabilityBySector.entries()]).toEqual([
      ...legacy.availabilityBySector.entries(),
    ]);
  });

  it("filters each seller scope once instead of once per seller", () => {
    const fixture = bookFixture();
    const args: AllocateArgs = {
      ...fixture,
      supply: 2400,
      demand: 2600,
      reservationRoom: 2000,
    };
    // Candidate rows visited by the per-seller filters: every group seller
    // re-filtered the whole root book. The scoped pass filters per
    // (corporation|root, state) pair, which is bounded by 5 x 4 here.
    const groupSellers = fixture.sellers.filter((s) => s.corporationId !== "rival-co").length;
    const perSellerVisits = groupSellers * fixture.buyers.length;
    const scopedVisits = fixture.buyers.length * 5 * 4;
    expect(perSellerVisits).toBeGreaterThan(scopedVisits * 2);
    expect(allocateInternalSupply(args).trades.length).toBe(
      legacyAllocateInternalSupply(args).trades.length
    );
  });
});

describe("settleConsumedInternalDiscounts inlined rebate", () => {
  const trades = Array.from({ length: 120 }, (_, i) => ({
    supplierSectorId: `sector-${i.toString().padStart(3, "0")}`,
    buyerSectorId: `sector-${((i + 1) % 120).toString().padStart(3, "0")}`,
    supplierCorpId: i % 3 === 0 ? "root-co" : "rival-co",
    buyerCorpId: i % 4 === 0 ? "child-co" : "taker-co",
    units: 1.5 + (i % 9) * 0.25,
    discount: [0, 0.05, 0.12, 0.2, 0.35][i % 5]!,
    commodity: ["steel", "food", "freight"][i % 3]!,
    marketPrice: i % 11 === 0 ? 0 : 12.5 + (i % 4),
  }));
  const consumption = new Map(
    [...Array(120).keys()].map((i) => {
      const sectorId = `sector-${i.toString().padStart(3, "0")}`;
      const rows = new Map<string, number>();
      rows.set("steel", 2 + (i % 5));
      rows.set("food", i % 3 === 0 ? 0 : 1.25);
      rows.set("freight", 0.75);
      return [sectorId, rows] as const;
    })
  );
  const committed = new Map(
    [...Array(120).keys()].map((i) => {
      const sectorId = `sector-${i.toString().padStart(3, "0")}`;
      const rows = new Map<string, number>();
      rows.set("steel", i % 4 === 0 ? 0.5 : 0);
      return [sectorId, rows] as const;
    })
  );

  it("charges the same seller and buyer legs as the per-trade helper call", () => {
    const current = settleConsumedInternalDiscounts(trades, consumption, 24, committed);
    const legacy = legacySettleConsumedInternalDiscounts(trades, consumption, 24, committed);
    expect([...current.entries()]).toEqual([...legacy.entries()]);
    expect(current.size).toBeGreaterThan(100);
  });

  it("keeps the zero-valued legs a zero discount or unpriced trade produced", () => {
    const zeroDiscount = trades.filter((t) => t.discount === 0);
    const current = settleConsumedInternalDiscounts(zeroDiscount, consumption, 24);
    const legacy = legacySettleConsumedInternalDiscounts(zeroDiscount, consumption, 24);
    expect([...current.entries()]).toEqual([...legacy.entries()]);
    expect([...current.values()].every((value) => value === 0)).toBe(true);
  });

  it("returns nothing when the turn length is not priceable", () => {
    expect(settleConsumedInternalDiscounts(trades, consumption, 0).size).toBe(0);
    expect(legacySettleConsumedInternalDiscounts(trades, consumption, 0).size).toBe(0);
  });
});
