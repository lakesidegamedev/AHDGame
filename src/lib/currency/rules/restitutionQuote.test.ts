import { describe, expect, it } from "vitest";
import { restitutionQuote } from "./restitutionQuote";
describe("historical nominal restitution", () => {
  it("converts USD through its actual valuation into CAD", () => {
    expect(
      restitutionQuote(
        100,
        "USD",
        "CAD",
        new Map([
          ["USD", 2],
          ["CAD", 2.8],
        ])
      )
    ).toMatchObject({ amountLocal: 140, anchorAmount: 50 });
  });
  it("preserves nominal dollars when source and target match", () => {
    expect(restitutionQuote(100, "USD", "USD", new Map([["USD", 2]]))).toMatchObject({
      amountLocal: 100,
      anchorAmount: 50,
    });
  });
  it.each([0, -1, NaN, Infinity])("refuses invalid valuations %s", (rate) => {
    expect(() =>
      restitutionQuote(
        100,
        "USD",
        "CAD",
        new Map([
          ["USD", 1],
          ["CAD", rate],
        ])
      )
    ).toThrow();
  });
});
