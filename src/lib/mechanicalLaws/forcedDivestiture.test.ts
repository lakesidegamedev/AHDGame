import { describe, expect, it } from "vitest";
import { bookValuePerShareAnchor } from "./forcedDivestiture";
describe("bookValuePerShareAnchor", () => {
  it("uses the holder's anchor cost basis when it has one", () => {
    const perShare = bookValuePerShareAnchor(
      { avgCostPerShare: 2, avgCostBasisUnit: "anchor" },
      { fundamentalSharePrice: 40 },
      4
    );
    expect(perShare).toBe(2);
  });

  it("falls back to the fundamental price converted at the target's fx rate", () => {
    const perShare = bookValuePerShareAnchor({}, { fundamentalSharePrice: 300 }, 3);
    expect(perShare).toBe(100);
  });

  it("ignores a legacy (non anchor) average cost basis", () => {
    const perShare = bookValuePerShareAnchor(
      { avgCostPerShare: 7 },
      { fundamentalSharePrice: 300 },
      3
    );
    expect(perShare).toBe(100);
  });

  it("returns 0 when neither an anchor basis nor a price is available", () => {
    expect(bookValuePerShareAnchor({}, { fundamentalSharePrice: 0 }, 3)).toBe(0);
    expect(bookValuePerShareAnchor({}, { fundamentalSharePrice: 300 }, 0)).toBe(0);
    expect(bookValuePerShareAnchor({ avgCostPerShare: 0, avgCostBasisUnit: "anchor" }, {}, 1)).toBe(
      0
    );
  });
});
