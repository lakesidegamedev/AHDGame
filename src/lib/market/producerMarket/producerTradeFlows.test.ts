import { describe, expect, it } from "vitest";
import {
  producerTradeFlows,
  producerTrades,
  type ProducerOffer,
  type ProducerTradeReceipt,
  type PurchaseOrder,
} from "./producerQuotes";

const offer = (id: string, unitPrice: number, units: number, book = "world"): ProducerOffer => ({
  id,
  accountId: `seller-${id}`,
  commodity: "steel",
  book,
  units,
  unitPrice,
  countryId: "US",
});

const order: PurchaseOrder = {
  id: "buyer-order",
  accountId: "buyer",
  commodity: "steel",
  book: "world",
  units: 100,
  maximumUnitPrice: 50,
  countryId: "US",
};

const receipt = (offers: ProducerOffer[], supplierOfferIds: string[]): ProducerTradeReceipt => ({
  turn: 7,
  offers,
  orders: [order],
  fills: [{ orderId: order.id, kind: "sale", unitPrice: 10, units: 30, supplierOfferIds }],
  tradeCount: 1,
});

const withoutId = (trades: Iterable<{ id: string }>) =>
  [...trades].map(({ id: _id, ...rest }) => rest);

describe("named-supplier trade replay", () => {
  const offers = [
    offer("c", 10, 20),
    offer("a", 10, 40),
    offer("b", 12, 50),
    offer("d", 10, 30, "country:US"),
    offer("e", 10, 10),
  ];

  it("draws only on named offers at the fill's price and book, in book order", () => {
    // Listed out of order, with a repeat, an unknown id, a dearer offer and
    // one from another book: only a and c take part, in id order.
    const trades = [...producerTrades(receipt(offers, ["c", "zzz", "b", "d", "a", "c"]))];
    expect(trades.map((t) => t.offerId)).toEqual(["a", "c"]);
    expect(trades[0].units).toBeCloseTo((30 * 40) / 60, 12);
    expect(trades[1].units).toBeCloseTo((30 * 20) / 60, 12);
    expect(trades[0].id).toBe(JSON.stringify([7, order.id, "a"]));
  });

  it("yields the same trades without ids", () => {
    for (const ids of [
      ["c", "a"],
      ["e", "b", "a"],
    ]) {
      const r = receipt(offers, ids);
      expect([...producerTradeFlows(r)]).toEqual(withoutId(producerTrades(r)));
    }
  });
});
