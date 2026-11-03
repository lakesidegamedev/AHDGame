import { describe, expect, it } from "vitest";
import { producerTrades, settleProducerMarket, type PurchaseOrder } from "./rules";

const tradeUnits = (receipt: Parameters<typeof producerTrades>[0]) => {
  const byOffer = new Map<string, number>();
  for (const trade of producerTrades(receipt))
    byOffer.set(trade.offerId, (byOffer.get(trade.offerId) ?? 0) + trade.units);
  return byOffer;
};

const totalCash = (accounts: readonly { cash: number }[]) =>
  accounts.reduce((sum, account) => sum + account.cash, 0);

describe("state-first freight clearing", () => {
  it("lets a local buyer take its own state's sellers before the national residual", () => {
    const result = settleProducerMarket({
      turn: 1,
      accounts: [
        { id: "buyer", cash: 1000 },
        { id: "local", cash: 0 },
        { id: "national", cash: 0 },
      ],
      offers: [
        {
          id: "offer-local",
          accountId: "local",
          commodity: "freight",
          book: "country:jp",
          units: 30,
          unitPrice: 5,
          stateId: "A",
        },
        {
          id: "offer-national",
          accountId: "national",
          commodity: "freight",
          book: "country:jp",
          units: 40,
          unitPrice: 5,
          stateId: "C",
        },
      ],
      orders: [
        {
          id: "order-a",
          accountId: "buyer",
          commodity: "freight",
          book: "country:jp",
          units: 50,
          maximumUnitPrice: 10,
          stateId: "A",
        },
      ],
    });
    expect(result.orders[0]).toMatchObject({ deliveredUnits: 50, cost: 250 });
    expect(result.offers).toMatchObject([
      { id: "offer-local", soldUnits: 30, revenue: 150 },
      { id: "offer-national", soldUnits: 20, revenue: 100 },
    ]);
    const units = tradeUnits(result.tradeReceipt);
    expect(units.get("offer-local")).toBe(30);
    expect(units.get("offer-national")).toBe(20);
  });

  it("serves a state with no local sellers from the national book", () => {
    const result = settleProducerMarket({
      turn: 1,
      accounts: [
        { id: "buyer", cash: 1000 },
        { id: "seller", cash: 0 },
      ],
      offers: [
        {
          id: "offer-a",
          accountId: "seller",
          commodity: "freight",
          book: "country:jp",
          units: 40,
          unitPrice: 5,
          stateId: "A",
        },
      ],
      orders: [
        {
          id: "order-b",
          accountId: "buyer",
          commodity: "freight",
          book: "country:jp",
          units: 40,
          maximumUnitPrice: 10,
          stateId: "B",
        },
      ],
    });
    expect(result.orders[0]).toMatchObject({ deliveredUnits: 40, cost: 200 });
    expect(result.offers[0]).toMatchObject({ soldUnits: 40, revenue: 200 });
    expect(tradeUnits(result.tradeReceipt).get("offer-a")).toBe(40);
  });

  it("matches the untagged outcome when every seller is already in the buyer's state", () => {
    const accounts = [
      { id: "buyer", cash: 1000 },
      { id: "seller-1", cash: 0 },
      { id: "seller-2", cash: 0 },
    ];
    const offers = [
      {
        id: "offer-1",
        accountId: "seller-1",
        commodity: "freight",
        book: "country:jp",
        units: 20,
        unitPrice: 5,
      },
      {
        id: "offer-2",
        accountId: "seller-2",
        commodity: "freight",
        book: "country:jp",
        units: 30,
        unitPrice: 5,
      },
    ];
    const orders: PurchaseOrder[] = [
      {
        id: "order",
        accountId: "buyer",
        commodity: "freight",
        book: "country:jp",
        units: 40,
        maximumUnitPrice: 10,
      },
    ];
    const tagged = settleProducerMarket({
      turn: 1,
      accounts,
      offers: offers.map((offer) => ({ ...offer, stateId: "A" })),
      orders: orders.map((order) => ({ ...order, stateId: "A" })),
    });
    const untagged = settleProducerMarket({ turn: 1, accounts, offers, orders });
    expect(tagged.accounts).toEqual(untagged.accounts);
    for (const [index, offer] of tagged.offers.entries()) {
      expect(offer.soldUnits).toBeCloseTo(untagged.offers[index].soldUnits, 9);
      expect(offer.revenue).toBeCloseTo(untagged.offers[index].revenue, 9);
    }
    expect(tagged.orders[0].deliveredUnits).toBeCloseTo(untagged.orders[0].deliveredUnits, 9);
    expect(tagged.orders[0].cost).toBeCloseTo(untagged.orders[0].cost, 9);
    expect(tagged.prices).toEqual(untagged.prices);
    expect(tradeUnits(tagged.tradeReceipt)).toEqual(tradeUnits(untagged.tradeReceipt));
  });

  it("does not let an earlier-sorted remote buyer take a local state's freight", () => {
    const result = settleProducerMarket({
      turn: 1,
      accounts: [
        { id: "buyer-b", cash: 5000 },
        { id: "buyer-a", cash: 5000 },
        { id: "seller-a", cash: 0 },
      ],
      offers: [
        {
          id: "offer-a",
          accountId: "seller-a",
          commodity: "freight",
          book: "country:jp",
          units: 50,
          unitPrice: 5,
          stateId: "A",
        },
      ],
      orders: [
        {
          id: "a-order-b",
          accountId: "buyer-b",
          commodity: "freight",
          book: "country:jp",
          units: 100,
          maximumUnitPrice: 10,
          stateId: "B",
        },
        {
          id: "z-order-a",
          accountId: "buyer-a",
          commodity: "freight",
          book: "country:jp",
          units: 50,
          maximumUnitPrice: 10,
          stateId: "A",
        },
      ],
    });
    const byId = new Map(result.orders.map((order) => [order.id, order]));
    expect(byId.get("z-order-a")).toMatchObject({ deliveredUnits: 50, cost: 250 });
    expect(byId.get("a-order-b")).toMatchObject({ deliveredUnits: 0, cost: 0 });
    const spend = result.orders.reduce((sum, order) => sum + order.cost, 0);
    const traded = [...producerTrades(result.tradeReceipt)].reduce(
      (sum, trade) => sum + trade.amount,
      0
    );
    expect(traded).toBeCloseTo(spend, 9);
    expect(totalCash(result.accounts)).toBeCloseTo(10000, 9);
  });
});
