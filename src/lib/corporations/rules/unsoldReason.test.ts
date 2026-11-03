import { describe, expect, it } from "vitest";
import { unsoldReason } from "./unsoldReason";

describe("unsoldReason", () => {
  it("is null when the output sold out", () => {
    expect(
      unsoldReason({ offeredUnits: 100, soldUnits: 100, askUnitPrice: 10, marketUnitPrice: 10 })
    ).toBeNull();
  });

  it("names an ask above what buyers paid", () => {
    expect(
      unsoldReason({ offeredUnits: 100, soldUnits: 40, askUnitPrice: 12, marketUnitPrice: 10 })
    ).toEqual({
      reason: "ask_above_market",
      unsoldShare: 0.6,
      askUnitPrice: 12,
      marketUnitPrice: 10,
    });
  });

  it("names covered buyers when the ask was competitive", () => {
    expect(
      unsoldReason({ offeredUnits: 100, soldUnits: 70, askUnitPrice: 10, marketUnitPrice: 10.02 })
        ?.reason
    ).toBe("buyers_covered");
  });

  it("names no buyers when nothing traded in the book", () => {
    expect(
      unsoldReason({ offeredUnits: 100, soldUnits: 0, askUnitPrice: 10, marketUnitPrice: null })
        ?.reason
    ).toBe("no_buyers");
  });

  it("ignores an empty offer", () => {
    expect(
      unsoldReason({ offeredUnits: 0, soldUnits: 0, askUnitPrice: 10, marketUnitPrice: 10 })
    ).toBeNull();
  });
});
