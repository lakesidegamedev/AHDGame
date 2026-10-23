/**
 * Funded advertising orders of different buyers settle in bounded lanes: one
 * batched read finds every prior journal record, buyers in different
 * currencies overlap, and orders that share a clearing pool stay one at a time.
 */
import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import { makeCorporation } from "@/lib/test-utils/factories";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import {
  quoteFundedProductAdvertising,
  productAdvertisingDenominationWitness,
} from "./rules/productAdvertising";

const inFlight = {
  total: 0,
  maxTotal: 0,
  byCurrency: new Map<string, number>(),
  maxPerCurrency: 0,
};

vi.mock("@/lib/banking/settlementJournal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/banking/settlementJournal")>();
  return {
    ...actual,
    settleTransition: async (db: Db, transition: Parameters<typeof actual.settleTransition>[1]) => {
      const currency = String(transition.currency);
      inFlight.total++;
      inFlight.maxTotal = Math.max(inFlight.maxTotal, inFlight.total);
      const mine = (inFlight.byCurrency.get(currency) ?? 0) + 1;
      inFlight.byCurrency.set(currency, mine);
      inFlight.maxPerCurrency = Math.max(inFlight.maxPerCurrency, mine);
      try {
        // Stand-in for network latency so lanes can overlap.
        await new Promise((resolve) => setTimeout(resolve, 2));
        return await actual.settleTransition(db, transition);
      } finally {
        inFlight.total--;
        inFlight.byCurrency.set(currency, (inFlight.byCurrency.get(currency) ?? 1) - 1);
      }
    },
  };
});

const { settleProductAdvertisingObligations } = await import("./mediaProductAdvertisingSettlement");

function world(currencies: Array<{ code: CurrencyCode; country: CountryId }>, perCurrency: number) {
  const db = createInMemoryDb();
  const seller = makeCorporation({ liquidCapital: 0, liquidCurrencyCode: "EUR", countryId: "DE" });
  const buyers = currencies.flatMap(({ code, country }) =>
    Array.from({ length: perCurrency }, () =>
      makeCorporation({ liquidCapital: 2000, liquidCurrencyCode: code, countryId: country })
    )
  );
  db.seed("corporations", [
    ...buyers.map((buyer) => {
      const quote = quoteFundedProductAdvertising({
        amountAnchor: 120,
        buyer: {
          corporationId: buyer._id.toString(),
          currencyCode: buyer.liquidCurrencyCode as CurrencyCode,
          localPerAnchor: 1,
          ...productAdvertisingDenominationWitness(buyer),
        },
        sellers: [
          {
            corporationId: seller._id.toString(),
            currencyCode: "EUR",
            localPerAnchor: 2,
            deliveredValueAnchor: 120,
            ...productAdvertisingDenominationWitness(seller),
          },
        ],
      });
      if (!quote) throw new Error("Missing funded quote");
      return {
        ...buyer,
        manufacturingProductAdvertisingObligationsV2: [
          { projectId: `p-${buyer._id.toString()}`, turn: 1, ...quote },
        ],
      };
    }),
    { ...seller },
  ]);
  return { db, buyers, seller };
}

describe("product advertising settlement lanes", () => {
  it("overlaps buyers across currencies, serializes each clearing pool, and settles every order", async () => {
    inFlight.maxTotal = 0;
    inFlight.maxPerCurrency = 0;
    const currencies: Array<{ code: CurrencyCode; country: CountryId }> = [
      { code: "USD", country: "US" },
      { code: "GBP", country: "UK" },
      { code: "JPY", country: "JP" },
    ];
    const { db, buyers, seller } = world(currencies, 4);
    const trips = countRoundTrips(db);
    const touched = await settleProductAdvertisingObligations(
      db as unknown as Db,
      buyers.map((buyer) => buyer._id),
      1,
      "manufacturing"
    );

    expect(inFlight.maxTotal).toBeGreaterThan(1);
    expect(inFlight.maxPerCurrency).toBe(1);
    // Every order lands once, and the clearing pays the seller for all of them.
    for (const buyer of buyers) {
      const row = db
        .collection("corporations")
        .docs.find((doc) => String(doc._id) === buyer._id.toString());
      expect(row?.liquidCapital).toBe(1880);
      expect(row?.manufacturingProductAdvertisingObligationsV2).toEqual([]);
    }
    const sellerRow = db
      .collection("corporations")
      .docs.find((doc) => String(doc._id) === seller._id.toString());
    expect(sellerRow?.liquidCapital).toBe(240 * buyers.length);
    // The touched list keeps the sequential order: buyers in row order, then the paid seller.
    expect(touched.map((id) => id.toHexString())).toEqual([
      ...buyers.map((buyer) => buyer._id.toHexString()),
      seller._id.toHexString(),
    ]);
    // Prior journal records are found with one batched read, not one per order.
    expect(trips.count("bankMoneyMoves", "find")).toBeLessThanOrEqual(3);
  });

  it("leaves a second pass a no-op once every order holds its receipt", async () => {
    const { db, buyers } = world([{ code: "USD", country: "US" }], 3);
    const store = db as unknown as Db;
    const ids = buyers.map((buyer) => buyer._id);
    await settleProductAdvertisingObligations(store, ids, 1, "manufacturing");
    const journalCount = db.collection("bankMoneyMoves").docs.length;
    await settleProductAdvertisingObligations(store, ids, 1, "manufacturing");
    expect(db.collection("bankMoneyMoves").docs.length).toBe(journalCount);
    for (const buyer of buyers) {
      const row = db
        .collection("corporations")
        .docs.find((doc) => String(doc._id) === buyer._id.toString());
      expect(row?.liquidCapital).toBe(1880);
    }
  });
});
