import { describe, expect, it } from "vitest";
import { householdDemandSpecs } from "./householdDemandRules";
import { householdPurchaseOrders } from "./householdRules";

describe("household demand specs", () => {
  const specs = householdDemandSpecs({
    wallets: [
      { accountId: "hh-ny", stateId: "NY" },
      { accountId: "hh-ny", stateId: "NY" },
    ],
    referencePrice: (c) => (c === "software" ? null : 10),
    priceHeadroom: 1.25,
  });

  it("one spec per wallet; local services on the state book, goods on the world book", () => {
    expect(specs).toHaveLength(1);
    const books = Object.fromEntries(specs[0].products.map((p) => [p.commodity, p.book]));
    expect(books.healthcare_services).toBe("state:NY");
    expect(books.food).toBe("world");
    expect(books.software).toBeUndefined(); // unpriced products are skipped
  });

  it("feeds the market's household order builder and never spends more than the wallet", () => {
    const orders = householdPurchaseOrders({ ...specs[0], cash: 1000 });
    const spend = orders.reduce((s, o) => s + (o as { maximumSpend?: number }).maximumSpend!, 0);
    expect(spend).toBeLessThanOrEqual(1000 + 1e-9);
    expect(orders.every((o) => o.maximumUnitPrice === 12.5)).toBe(true);
  });
});
