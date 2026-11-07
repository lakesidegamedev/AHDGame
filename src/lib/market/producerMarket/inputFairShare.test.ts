import { describe, expect, it } from "vitest";
import { settleProducerMarket, type PurchaseOrder } from "./rules";
import { advanceProducerEconomy, type ProductionPlan } from "./production";

const order = (
  id: string,
  accountId: string,
  units: number,
  extra: Partial<PurchaseOrder> = {}
): PurchaseOrder => ({
  id,
  accountId,
  units,
  commodity: "steel",
  book: "world",
  maximumUnitPrice: 10,
  priority: 1,
  fairShare: true,
  ...extra,
});

function clear(orders: PurchaseOrder[], cash = 1000, units = 60) {
  return settleProducerMarket({
    turn: 1,
    accounts: [
      { id: "a", cash },
      { id: "b", cash: 1000 },
      { id: "seller", cash: 0 },
    ],
    offers: [
      { id: "steel", accountId: "seller", commodity: "steel", book: "world", units, unitPrice: 1 },
    ],
    orders,
  });
}

const fills = (result: ReturnType<typeof clear>) =>
  Object.fromEntries(result.orders.map((o) => [o.id, o.deliveredUnits]));

describe("scarce producer inputs", () => {
  it("shares by demand rather than order age, regardless of country", () => {
    expect(
      fills(
        clear([
          order("older", "a", 100, { countryId: "JP" }),
          order("newer", "b", 200, { countryId: "US" }),
        ])
      )
    ).toEqual({ older: 20, newer: 40 });
    expect(fills(clear([order("zzz", "a", 100), order("aaa", "b", 200)]))).toEqual({
      aaa: 40,
      zzz: 20,
    });
  });

  it("splits a shared company's limited cash across siblings before reallocating leftovers", () => {
    const orders = [order("a-first", "a", 100), order("a-second", "a", 100), order("b", "b", 100)];
    expect(fills(clear(orders, 10))).toEqual({ "a-first": 5, "a-second": 5, b: 50 });
    expect(fills(clear([orders[2], orders[1], orders[0]], 10))).toEqual({
      "a-first": 5,
      "a-second": 5,
      b: 50,
    });
  });

  it("honors price limits and reallocates an ineligible buyer's share", () => {
    expect(
      fills(clear([order("a", "a", 100, { maximumUnitPrice: 0.5 }), order("b", "b", 100)]))
    ).toEqual({ a: 0, b: 60 });
  });

  it("preserves higher-priority supplier reservations", () => {
    expect(
      fills(
        clear([
          order("reserved", "a", 20, {
            supplierOfferId: "steel",
            contractUnitPrice: 1,
            priority: 2,
          }),
          order("a", "a", 100),
          order("b", "b", 100),
        ])
      )
    ).toEqual({ a: 20, b: 20, reserved: 20 });
  });

  it("keeps restricted routes outside the pooled allocation", () => {
    expect(
      fills(clear([order("a", "a", 100, { eligibleOfferIds: [] }), order("b", "b", 100)]))
    ).toEqual({ a: 0, b: 60 });
  });

  it("does not favor splitting the same demand over more sites", () => {
    const result = clear([order("a1", "a", 50), order("a2", "a", 50), order("b", "b", 100)]);
    expect(fills(result)).toEqual({ a1: 15, a2: 15, b: 30 });
    expect(result.accounts.reduce((sum, a) => sum + a.cash, 0)).toBe(2000);
  });

  it("marks actual producer input orders", () => {
    const plant = (id: string, accountId: string): ProductionPlan => ({
      id,
      accountId,
      capacityUnits: 100,
      activeFraction: 1,
      outputMultiplier: 1,
      inputs: [{ commodity: "steel", book: "world", unitsPerOutput: 1, maximumUnitPrice: 10 }],
      outputs: [
        {
          commodity: "widgets",
          book: "world",
          unitsPerOutput: 1,
          referenceUnitPrice: 20,
          policy: { kind: "manual", unitPrice: 20 },
          storable: true,
        },
      ],
      labourCost: 0,
      otherOperatingCost: 0,
      labourRecipientAccountId: "seller",
      operatingRecipientAccountId: "seller",
      inputStock: [],
      outputStock: [],
    });
    const input = {
      turn: 1,
      maximumPlanningPasses: 32,
      ownSitesFirst: true,
      accounts: [
        { id: "a", cash: 10000 },
        { id: "b", cash: 10000 },
        { id: "seller", cash: 0 },
      ],
      producers: [plant("older", "a"), plant("newer", "b")],
      externalOffers: [
        {
          id: "steel",
          accountId: "seller",
          commodity: "steel",
          book: "world",
          units: 60,
          unitPrice: 1,
        },
      ],
    };
    const result = advanceProducerEconomy(input);
    expect(result.producers[0].producedUnits).toBeCloseTo(result.producers[1].producedUnits);
    expect(
      result.tradeReceipt.orders.filter((o) => o.commodity === "steel").every((o) => o.fairShare)
    ).toBe(true);
  });

  it("retains own-site delivery priority before the shared market", () => {
    const result = settleProducerMarket({
      turn: 1,
      ownSitesFirst: true,
      accounts: [
        { id: "a", cash: 1000 },
        { id: "b", cash: 1000 },
      ],
      offers: [
        { id: "own", accountId: "a", commodity: "steel", book: "world", units: 60, unitPrice: 1 },
      ],
      orders: [order("zzz-own", "a", 100), order("aaa-outside", "b", 100)],
    });
    expect(fills(result)).toEqual({ "aaa-outside": 0, "zzz-own": 60 });
  });

  it("keeps a market-first company behind outside buyers even when both request fair shares", () => {
    const result = settleProducerMarket({
      turn: 1,
      ownSitesFirst: true,
      marketFirstAccounts: ["a"],
      accounts: [
        { id: "a", cash: 1000 },
        { id: "b", cash: 1000 },
      ],
      offers: [
        { id: "own", accountId: "a", commodity: "steel", book: "world", units: 60, unitPrice: 1 },
      ],
      orders: [order("aaa-market-first", "a", 100), order("zzz-outside", "b", 100)],
    });
    expect(fills(result)).toEqual({ "aaa-market-first": 0, "zzz-outside": 60 });
  });

  it.each(["spend", "quantity"] as const)(
    "caps a shared %s group before any sibling spends it",
    (kind) => {
      const extra =
        kind === "spend"
          ? { spendGroup: { id: "shared", maximumSpend: 10 } }
          : { quantityGroup: { id: "shared", maximumUnits: 10 } };
      expect(
        fills(
          clear([order("a1", "a", 100, extra), order("a2", "a", 100, extra), order("b", "b", 100)])
        )
      ).toEqual({ a1: 5, a2: 5, b: 50 });
    }
  );
});
