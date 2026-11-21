import { describe, expect, it } from "vitest";
import { listOutputs, outputSalesSplit } from "./outputSalesSplit";

describe("outputSalesSplit", () => {
  it("names the product outside buyers left unsold", () => {
    const split = outputSalesSplit([
      { label: "Electronics", soldFraction: 1 },
      { label: "Software", soldFraction: 0.12 },
    ]);
    expect(split?.stuck.map((o) => o.label)).toEqual(["Software"]);
    expect(listOutputs(split!.stuck)).toBe("Software (12% sold)");
  });

  it("never calls output delivered to the company's own sites unsold", () => {
    const split = outputSalesSplit([
      { label: "Energy", soldFraction: 0, settledSales: { offered: 860, ownSites: 860 } },
      { label: "Steel", soldFraction: 1 },
    ]);
    expect(split).toBeNull();
  });

  it("reads own-site share from the older payload field", () => {
    const split = outputSalesSplit([
      { label: "Energy", soldFraction: 0.3, ownSite: { share: 0.7 } },
      { label: "Steel", soldFraction: 0.1 },
    ]);
    expect(split?.selling).toEqual([{ label: "Energy", pct: 100, ownSites: true }]);
    expect(listOutputs(split!.selling)).toBe("Energy (100% sold or sent to your sites)");
  });

  it("stays quiet with fewer than two measured products", () => {
    expect(outputSalesSplit([{ label: "Steel", soldFraction: 0.1 }, { label: "Coal" }])).toBeNull();
  });
});
