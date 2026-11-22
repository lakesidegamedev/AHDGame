import { describe, expect, it } from "vitest";
import { weightedRecipeMix } from "./plantInputMix";

describe("weightedRecipeMix", () => {
  it("lists only what running plants use", () => {
    expect(weightedRecipeMix([{ weight: 5, rates: { natural_gas: 0.2, steel: 0.1 } }])).toEqual([
      { commodity: "natural_gas", rate: 0.2 },
      { commodity: "steel", rate: 0.1 },
    ]);
  });
  it("weights by revenue across plants", () => {
    const mix = weightedRecipeMix([
      { weight: 3, rates: { coal: 0.4 } },
      { weight: 1, rates: { steel: 0.4 } },
    ]);
    expect(mix.find((m) => m.commodity === "coal")!.rate).toBeCloseTo(0.3);
    expect(mix.find((m) => m.commodity === "steel")!.rate).toBeCloseTo(0.1);
  });
  it("is empty with no weight", () => {
    expect(weightedRecipeMix([{ weight: 0, rates: { coal: 1 } }])).toEqual([]);
  });
});
