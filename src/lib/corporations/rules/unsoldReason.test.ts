import { describe, expect, it } from "vitest";
import { unsoldByCommodity, unsoldReasonFor } from "./unsoldReason";

const row = (over: Partial<Parameters<typeof unsoldByCommodity>[0][number]> = {}) => ({
  commodity: "energy",
  book: "world",
  offeredUnits: 100,
  deliveredUnits: 40,
  askingUnitPrice: 10,
  ...over,
});

describe("unsoldReasonFor", () => {
  it("names an ask above what buyers paid", () => {
    expect(unsoldReasonFor(12, 10)).toBe("ask_above_market");
  });

  it("names a shared market when the ask matched what buyers paid", () => {
    expect(unsoldReasonFor(10, 10.02)).toBe("shared_at_market");
  });

  it("names exhausted buyers when the ask was below what they paid", () => {
    expect(unsoldReasonFor(8, 10)).toBe("buyers_exhausted");
  });

  it("names no buyers when the lane price is missing, whatever the ask", () => {
    expect(unsoldReasonFor(12, null)).toBe("no_buyers");
    expect(unsoldReasonFor(12, undefined)).toBe("no_buyers");
    expect(unsoldReasonFor(12, 0)).toBe("no_buyers");
  });
});

describe("unsoldByCommodity", () => {
  const prices = (map: Record<string, number>) => (commodity: string, book: string) =>
    map[`${commodity}|${book}`];

  it("is empty when the output sold out", () => {
    expect(unsoldByCommodity([row({ deliveredUnits: 100 })], () => 10).size).toBe(0);
  });

  it("sums every plant's row before judging, so one plant does not speak for all", () => {
    // Plant A sold everything, plant B sold nothing: 50% unsold overall.
    const readings = unsoldByCommodity(
      [
        row({ offeredUnits: 100, deliveredUnits: 100, askingUnitPrice: 9 }),
        row({ offeredUnits: 100, deliveredUnits: 0, askingUnitPrice: 12 }),
      ],
      prices({ "energy|world": 10 })
    );
    const energy = readings.get("energy")!;
    expect(energy.unsoldShare).toBeCloseTo(0.5, 12);
    // Offer-weighted ask in the book: (100 * 9 + 100 * 12) / 200.
    expect(energy.askUnitPrice).toBeCloseTo(10.5, 12);
    expect(energy.reason).toBe("ask_above_market");
  });

  it("judges by the book that left the most units unsold", () => {
    const readings = unsoldByCommodity(
      [
        row({ book: "world", offeredUnits: 100, deliveredUnits: 90, askingUnitPrice: 20 }),
        row({ book: "state:CA", offeredUnits: 100, deliveredUnits: 10, askingUnitPrice: 8 }),
      ],
      prices({ "energy|world": 10, "energy|state:CA": 10 })
    );
    expect(readings.get("energy")!.reason).toBe("buyers_exhausted");
  });

  it("reports no buyers with no price, even for an ask that would be above market", () => {
    const reading = unsoldByCommodity([row({ askingUnitPrice: 50 })], () => undefined).get(
      "energy"
    )!;
    expect(reading).toMatchObject({ reason: "no_buyers", marketUnitPrice: null });
  });

  it("caps delivered at offered, so a share is never negative", () => {
    expect(unsoldByCommodity([row({ deliveredUnits: 500 })], () => 10).size).toBe(0);
  });

  it("ignores rows with nothing offered", () => {
    expect(unsoldByCommodity([row({ offeredUnits: 0, deliveredUnits: 0 })], () => 10).size).toBe(0);
  });

  it("treats a row without a book as unpriced instead of building a bad key", () => {
    const seen: string[] = [];
    const reading = unsoldByCommodity([row({ book: undefined })], (c, b) => {
      seen.push(`${c}|${b}`);
      return 10;
    }).get("energy")!;
    expect(seen).toEqual([]);
    expect(reading.reason).toBe("no_buyers");
  });
});
