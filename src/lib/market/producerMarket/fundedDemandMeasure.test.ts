import { describe, expect, it } from "vitest";
import { settleProducerMarket } from "./rules";

const offer = (units: number, unitPrice: number, countryId = "US") => ({
  id: `offer-${countryId}`,
  accountId: `seller-${countryId}`,
  commodity: "food",
  book: "world",
  units,
  unitPrice,
  countryId,
});

const row = (result: ReturnType<typeof settleProducerMarket>, key: string) =>
  (result.countryBooks ?? []).find((r) => `${r.countryId}:${r.commodity}` === key);

describe("funded demand measurement (#5450)", () => {
  it("measures regional orders against the same shared cash without changing settlement", () => {
    const input = {
      turn: 1,
      accounts: [
        { id: "buyer", cash: 100 },
        { id: "seller", cash: 0 },
      ],
      offers: [
        {
          id: "health",
          accountId: "seller",
          commodity: "healthcare_services",
          book: "state:SCO",
          countryId: "UK",
          stateId: "SCO",
          units: 40,
          unitPrice: 2,
        },
      ],
      orders: [
        {
          id: "a",
          accountId: "buyer",
          commodity: "healthcare_services",
          book: "state:SCO",
          countryId: "UK",
          stateId: "SCO",
          units: 60,
          maximumUnitPrice: 2,
        },
        {
          id: "b",
          accountId: "buyer",
          commodity: "network_services",
          book: "world",
          countryId: "UK",
          stateId: "SCO",
          units: 60,
          maximumUnitPrice: 2,
        },
      ],
    };
    const { countryBooks, regionalBooks, ...economic } = settleProducerMarket({
      ...input,
      trackCountryBooks: true,
    });
    expect(economic).toEqual(settleProducerMarket(input));
    expect(regionalBooks).toEqual([
      { stateId: "SCO", commodity: "healthcare_services", funded: 50, filled: 40 },
      { stateId: "SCO", commodity: "network_services", funded: 0, filled: 0 },
    ]);
    expect(countryBooks?.find((r) => r.commodity === "healthcare_services")?.funded).toBe(50);
  });
  it("separates a large unfunded order from what the buyer could pay for", () => {
    const result = settleProducerMarket({
      turn: 1,
      trackCountryBooks: true,
      accounts: [
        { id: "buyer", cash: 100 },
        { id: "seller-US", cash: 0 },
      ],
      offers: [offer(1000, 1)],
      orders: [
        {
          id: "o1",
          accountId: "buyer",
          commodity: "food",
          book: "world",
          units: 1000,
          maximumUnitPrice: 2,
          countryId: "US",
        },
      ],
    });
    // demand is unchanged: the price phase still reads ordered units.
    expect(row(result, "US:food")).toMatchObject({
      demand: 1000,
      requested: 1000,
      funded: 50,
      filled: 100,
    });
  });

  it("counts a reservation and its public fallback once", () => {
    const group = { id: "g1", maximumUnits: 10 };
    const result = settleProducerMarket({
      turn: 1,
      trackCountryBooks: true,
      accounts: [
        { id: "buyer", cash: 1000 },
        { id: "seller-US", cash: 0 },
      ],
      offers: [offer(4, 1)],
      orders: [
        {
          id: "reserve",
          accountId: "buyer",
          commodity: "food",
          book: "world",
          units: 10,
          maximumUnitPrice: 1,
          supplierOfferId: "offer-US",
          quantityGroup: group,
          priority: 1,
          countryId: "US",
        },
        {
          id: "public",
          accountId: "buyer",
          commodity: "food",
          book: "world",
          units: 10,
          maximumUnitPrice: 1,
          quantityGroup: group,
          countryId: "US",
        },
      ],
    });
    const book = row(result, "US:food")!;
    expect(book.demand).toBe(20);
    expect(book.requested).toBe(10);
    expect(book.funded).toBe(10);
    expect(book.filled).toBe(4);
  });

  it("shares one account budget across that account's orders", () => {
    const result = settleProducerMarket({
      turn: 1,
      trackCountryBooks: true,
      accounts: [
        { id: "household", cash: 30 },
        { id: "seller-US", cash: 0 },
      ],
      offers: [offer(100, 1)],
      orders: [
        {
          id: "a",
          accountId: "household",
          commodity: "food",
          book: "world",
          units: 20,
          maximumUnitPrice: 1,
          countryId: "US",
        },
        {
          id: "b",
          accountId: "household",
          commodity: "food",
          book: "world",
          units: 20,
          maximumUnitPrice: 1,
          countryId: "US",
        },
      ],
    });
    // 40 units requested, 30 of cash at a limit of 1: only 30 are budget-backed.
    expect(row(result, "US:food")).toMatchObject({ requested: 40, funded: 30, filled: 30 });
  });

  it("honours an order's own spending limit", () => {
    const result = settleProducerMarket({
      turn: 1,
      trackCountryBooks: true,
      accounts: [
        { id: "state", cash: 1000 },
        { id: "seller-US", cash: 0 },
      ],
      offers: [offer(100, 2)],
      orders: [
        {
          id: "line",
          accountId: "state",
          commodity: "food",
          book: "world",
          units: 100,
          maximumUnitPrice: 2,
          maximumSpend: 50,
          countryId: "US",
        },
      ],
    });
    expect(row(result, "US:food")).toMatchObject({ requested: 100, funded: 25, filled: 25 });
  });

  it("reports nothing extra when books are not tracked", () => {
    const result = settleProducerMarket({
      turn: 1,
      accounts: [
        { id: "buyer", cash: 10 },
        { id: "seller-US", cash: 0 },
      ],
      offers: [offer(10, 1)],
      orders: [
        {
          id: "o1",
          accountId: "buyer",
          commodity: "food",
          book: "world",
          units: 10,
          maximumUnitPrice: 1,
          countryId: "US",
        },
      ],
    });
    expect(result.countryBooks).toBeUndefined();
  });
});

describe("household spillover on the funded book", () => {
  const input = {
    turn: 1,
    trackCountryBooks: true,
    accounts: [
      { id: "buyer", cash: 100 },
      { id: "seller-US", cash: 0 },
    ],
    offers: [offer(30, 1)],
    orders: [
      {
        id: "o1",
        accountId: "buyer",
        commodity: "food",
        book: "world",
        units: 50,
        maximumUnitPrice: 2,
        countryId: "US",
      },
    ],
  };

  it("tags spillover units on the row and changes nothing else", () => {
    const plain = settleProducerMarket(input);
    const tagged = settleProducerMarket({
      ...input,
      spilloverUnitsByOrder: new Map([["o1", 40]]),
    });
    expect(row(tagged, "US:food")).toMatchObject({ requested: 50, spilloverRequested: 40 });
    const { spilloverRequested, ...rest } = row(tagged, "US:food")!;
    expect(spilloverRequested).toBe(40);
    expect(JSON.stringify({ ...tagged, countryBooks: [rest] })).toBe(JSON.stringify(plain));
  });

  it("never tags more than the order asked for, and omits the field without spillover", () => {
    const capped = settleProducerMarket({
      ...input,
      spilloverUnitsByOrder: new Map([["o1", 80]]),
    });
    expect(row(capped, "US:food")!.spilloverRequested).toBe(50);
    expect(row(settleProducerMarket(input), "US:food")).not.toHaveProperty("spilloverRequested");
  });
});
