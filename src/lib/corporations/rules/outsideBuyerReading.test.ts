import { describe, expect, it } from "vitest";
import { outsideBuyerRows, outsidePriceReading, plantBuyerRows } from "./outsideBuyerReading";

describe("outsideBuyerRows", () => {
  it("keeps the commodity's buyers, largest delivery first", () => {
    const rows = outsideBuyerRows(
      [
        { commodity: "energy", kind: "publicBuyer", requested: 10, delivered: 8 },
        { commodity: "food", kind: "households", requested: 99, delivered: 99 },
        { commodity: "energy", kind: "households", requested: 50, delivered: 40 },
      ],
      "energy"
    );
    expect(rows.map((r) => r.kind)).toEqual(["households", "publicBuyer"]);
    expect(rows[0].name).toBe("Households");
  });
});

describe("outsidePriceReading", () => {
  it("blames a low ask when the ask is under the regional price", () => {
    const r = outsidePriceReading({
      askUnitPrice: 100,
      paidUnitPrice: 106.78,
      bookUnitPrice: 106,
      regionalUnitPrice: 117,
    });
    expect(r?.belowRegional).toBe("ask_below_regional");
    expect(r!.gapShare).toBeCloseTo(-0.0873, 3);
  });
  it("blames the book when the ask is at or above regional but buyers paid less", () => {
    const r = outsidePriceReading({
      askUnitPrice: 120,
      paidUnitPrice: 106,
      bookUnitPrice: 106,
      regionalUnitPrice: 117,
    });
    expect(r?.belowRegional).toBe("book_below_regional");
  });
  it("falls back to mixed lanes when neither ask nor book is under", () => {
    const r = outsidePriceReading({
      askUnitPrice: 120,
      paidUnitPrice: 106,
      bookUnitPrice: null,
      regionalUnitPrice: 117,
    });
    expect(r?.belowRegional).toBe("mixed_lanes");
  });
  it("reports no gap when paid is at the regional price", () => {
    expect(
      outsidePriceReading({
        askUnitPrice: 117,
        paidUnitPrice: 117,
        bookUnitPrice: 117,
        regionalUnitPrice: 117,
      })?.belowRegional
    ).toBeNull();
  });
  it("returns null without a paid price", () => {
    expect(
      outsidePriceReading({
        askUnitPrice: 1,
        paidUnitPrice: null,
        bookUnitPrice: null,
        regionalUnitPrice: 1,
      })
    ).toBeNull();
  });
});

describe("plantBuyerRows", () => {
  it("scales per-turn units to a day and orders the largest first", () => {
    const rows = plantBuyerRows({ publicBuyer: 2, households: 5, companies: 1 }, 24);
    expect(rows!.map((r) => [r.kind, r.delivered])).toEqual([
      ["households", 120],
      ["publicBuyer", 48],
      ["companies", 24],
    ]);
    expect(rows![2].name).toBe("Other companies");
  });
  it("returns null when nothing was recorded so the market-wide split is used", () => {
    expect(plantBuyerRows(undefined, 24)).toBeNull();
    expect(plantBuyerRows({}, 24)).toBeNull();
    expect(plantBuyerRows({ households: 0 }, 24)).toBeNull();
  });
});
