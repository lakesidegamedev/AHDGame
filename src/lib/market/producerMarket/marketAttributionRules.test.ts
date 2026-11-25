import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import {
  carriedStockByBook,
  marketAccountKind,
  marketAttributionGaps,
  totalOf,
  type CountryBookAttribution,
} from "./marketAttributionRules";

const WIDE_US = JSON.stringify(["world", "wideEconomy", "US", null, "USD"]);
const BG_FR = JSON.stringify(["world", "backgroundEconomy", "FR", null, "EUR"]);
const HOUSEHOLDS = JSON.stringify(["world", "households", "US", "US_CA", "USD"]);
const CORP = "aaaaaaaaaaaaaaaaaaaaaaaa";
const BUYER_CORP = "bbbbbbbbbbbbbbbbbbbbbbbb";

const stockOnly = (
  id: string,
  accountId: string,
  commodity: string,
  units: number,
  price: number
) =>
  ({
    id,
    accountId,
    capacityUnits: 0,
    activeFraction: 1,
    outputMultiplier: 1,
    labourCost: 0,
    otherOperatingCost: 0,
    labourRecipientAccountId: HOUSEHOLDS,
    operatingRecipientAccountId: HOUSEHOLDS,
    inputs: [],
    outputs: [
      {
        commodity,
        book: "world",
        unitsPerOutput: 0,
        referenceUnitPrice: price,
        retainedUnitCost: 1,
        policy: { kind: "manual", unitPrice: price },
        storable: true,
      },
    ],
    inputStock: [],
    outputStock: [{ commodity, book: "world", units, quoteUnitCost: 1 }],
  }) as ProductionPlan;

/**
 * Advertising sold by a US company (4 units) and France's background economy
 * (an economy-only country, 6 units); bought by a US company, US households,
 * France and the US background economy's buyer; the US background economy's
 * seller fills what US buyers still want. Every kind of account at once.
 */
function mixedMarket() {
  return advanceProducerEconomy({
    turn: 1,
    accounts: [
      { id: CORP, cash: 0 },
      { id: BUYER_CORP, cash: 1000 },
      { id: HOUSEHOLDS, cash: 1000 },
      { id: BG_FR, cash: 1000 },
      { id: WIDE_US, cash: 100 },
    ],
    carryLossByCommodity: { advertising: 0 },
    producers: [stockOnly("plant", CORP, "advertising", 4, 10)],
    countryOfProducer: () => "US",
    trackCountryBooks: true,
    externalOffers: [
      {
        id: "fr-offer",
        accountId: BG_FR,
        commodity: "advertising",
        book: "world",
        units: 6,
        unitPrice: 11,
        countryId: "FR",
      },
    ],
    externalOrders: [
      {
        id: "corp-order",
        accountId: BUYER_CORP,
        commodity: "advertising",
        book: "world",
        units: 15,
        maximumUnitPrice: 20,
        countryId: "US",
      },
      {
        id: "hh-order",
        accountId: HOUSEHOLDS,
        commodity: "advertising",
        book: "world",
        units: 3,
        maximumUnitPrice: 20,
        countryId: "US",
      },
      {
        id: "fr-order",
        accountId: BG_FR,
        commodity: "advertising",
        book: "world",
        units: 2,
        maximumUnitPrice: 20,
        countryId: "FR",
      },
    ],
    residualOffers: [
      {
        id: JSON.stringify(["wide", "offer", "US", "advertising", "world"]),
        accountId: WIDE_US,
        commodity: "advertising",
        book: "world",
        units: 50,
        unitPrice: 12,
        countryId: "US",
      },
    ],
  });
}

describe("market attribution", () => {
  it("names a company, each wallet kind and anything else", () => {
    expect(marketAccountKind(CORP)).toBe("company");
    expect(marketAccountKind(WIDE_US)).toBe("wideEconomy");
    expect(marketAccountKind(BG_FR)).toBe("backgroundEconomy");
    expect(marketAccountKind(HOUSEHOLDS)).toBe("households");
    expect(marketAccountKind("someone")).toBe("other");
  });

  it("accounts for every unit of every country book, with the background economy apart", () => {
    const r = mixedMarket();
    const books = r.countryBooks!;
    const attribution = r.countryBookAttribution!;
    expect(marketAttributionGaps(books, attribution)).toEqual([]);
    const us = attribution.find((a) => a.countryId === "US")!;
    const usBook = books.find((b) => b.countryId === "US")!;
    // US supply: the company's 4 offered and what the background economy sold.
    expect(us.supplyBy.company).toBeCloseTo(4, 9);
    expect(us.supplyBy.wideEconomy ?? 0).toBeGreaterThan(0);
    expect(totalOf(us.supplyBy)).toBeCloseTo(usBook.supply, 9);
    expect(totalOf(us.demandBy)).toBeCloseTo(usBook.demand, 9);
    expect(totalOf(us.filledBy)).toBeCloseTo(usBook.filled!, 9);
    expect(us.demandBy.households).toBeCloseTo(3, 9);
    const fr = attribution.find((a) => a.countryId === "FR")!;
    expect(fr.supplyBy.backgroundEconomy).toBeCloseTo(6, 9);
    expect(fr.demandBy.backgroundEconomy).toBeCloseTo(2, 9);
    // Company rows are each company's part of the same books.
    const companyOffered = r
      .companyBooks!.filter((c) => c.countryId === "US")
      .reduce((n, c) => n + c.offered, 0);
    expect(companyOffered).toBeCloseTo(us.supplyBy.company!, 9);
    // The US plant made nothing this turn and offered 4 units of old stock.
    expect(us.carriedStock).toBeCloseTo(4, 9);
    expect(fr.carriedStock).toBeUndefined();
  });

  it("reports any book total that some volume does not account for", () => {
    const r = mixedMarket();
    const withoutWide: CountryBookAttribution[] = r.countryBookAttribution!.map((a) => {
      const supplyBy = { ...a.supplyBy };
      delete supplyBy.wideEconomy;
      return { ...a, supplyBy };
    });
    const gaps = marketAttributionGaps(r.countryBooks!, withoutWide);
    expect(gaps).toEqual([
      expect.objectContaining({ countryId: "US", commodity: "advertising", measure: "supply" }),
    ]);
  });
});

describe("old stock per country book", () => {
  it("is what a plant offered beyond this turn's output; own-site deliveries do not change it", () => {
    const stock = carriedStockByBook(
      [
        // Made 100 and offered 130: 30 of the offer is old stock, whatever its own sites took.
        {
          id: "p1",
          products: [
            {
              commodity: "steel",
              producedUnits: 100,
              internalDeliveredUnits: 20,
              offeredUnits: 130,
            },
          ],
        },
        // Offered only this turn's output: no stock.
        { id: "p2", products: [{ commodity: "steel", producedUnits: 40, offeredUnits: 40 }] },
        // A service with heavy own use offers what it made: no stock.
        {
          id: "p4",
          products: [
            {
              commodity: "advertising",
              producedUnits: 50,
              internalDeliveredUnits: 30,
              offeredUnits: 50,
            },
          ],
        },
        { id: "p3", products: [{ commodity: "steel", producedUnits: 0, offeredUnits: 5 }] },
      ],
      (id) => (id === "p3" ? "CA" : "US")
    );
    expect(stock.get(JSON.stringify(["US", "steel"]))).toBeCloseTo(30, 9);
    expect(stock.has(JSON.stringify(["US", "advertising"]))).toBe(false);
    expect(stock.get(JSON.stringify(["CA", "steel"]))).toBeCloseTo(5, 9);
  });
});
