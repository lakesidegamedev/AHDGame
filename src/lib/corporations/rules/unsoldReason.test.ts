import { describe, expect, it } from "vitest";
import {
  unsoldByCommodity,
  unsoldReadingsFor,
  unsoldReasonFor,
  type SettledProductRow,
} from "./unsoldReason";

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

describe("buyers elsewhere (#5450)", () => {
  const exhausted = [row({ askingUnitPrice: 8 })];
  const priced = (_c: string, _b: string) => 10;

  it("names buyers in other states for a covered local market while the good is short", () => {
    const reading = unsoldByCommodity(exhausted, priced, () => "state").get("energy")!;
    expect(reading).toMatchObject({ reason: "buyers_elsewhere", elsewhere: "state" });
  });

  it("names buyers in other countries when this book had no trade at all", () => {
    const reading = unsoldByCommodity(
      exhausted,
      () => null,
      () => "country"
    ).get("energy")!;
    expect(reading).toMatchObject({ reason: "buyers_elsewhere", elsewhere: "country" });
  });

  it("keeps a price problem a price problem, even when the good is short elsewhere", () => {
    const reading = unsoldByCommodity([row({ askingUnitPrice: 12 })], priced, () => "state").get(
      "energy"
    )!;
    expect(reading.reason).toBe("ask_above_market");
    expect(reading.elsewhere).toBeUndefined();
  });

  it("stays exhausted buyers when the good is not short anywhere", () => {
    expect(unsoldByCommodity(exhausted, priced, () => null).get("energy")!.reason).toBe(
      "buyers_exhausted"
    );
  });
});

describe("unsoldReadingsFor (#5450)", () => {
  // Typed against the settled receipt product, so a change to that shape fails here.
  const product = (over: Partial<SettledProductRow> = {}): SettledProductRow => ({
    commodity: "energy",
    book: "world",
    offeredUnits: 100,
    deliveredUnits: 30,
    askingUnitPrice: 12,
    ...over,
  });
  const receipt = { turn: 9, products: [product(), product()] };
  const prices = { "energy|world": 10 };

  it("reads every plant row against the lane price for its book", () => {
    const reading = unsoldReadingsFor({
      isCeo: true,
      receipt,
      currentTurn: 10,
      laneClearingPrices: prices,
    }).get("energy")!;
    expect(reading).toMatchObject({ reason: "ask_above_market", marketUnitPrice: 10 });
    expect(reading.unsoldShare).toBeCloseTo(0.7, 12);
  });

  it("shows nothing to a viewer who is not the CEO", () => {
    expect(
      unsoldReadingsFor({ isCeo: false, receipt, currentTurn: 10, laneClearingPrices: prices }).size
    ).toBe(0);
  });

  it("shows nothing for a receipt older than last turn", () => {
    expect(
      unsoldReadingsFor({ isCeo: true, receipt, currentTurn: 12, laneClearingPrices: prices }).size
    ).toBe(0);
  });

  it("shows nothing without lane prices", () => {
    expect(
      unsoldReadingsFor({ isCeo: true, receipt, currentTurn: 10, laneClearingPrices: undefined })
        .size
    ).toBe(0);
  });

  it("passes the short-elsewhere signal through", () => {
    const covered = { turn: 9, products: [product({ askingUnitPrice: 8 })] };
    expect(
      unsoldReadingsFor({
        isCeo: true,
        receipt: covered,
        currentTurn: 10,
        laneClearingPrices: prices,
        shortElsewhere: () => "state",
      }).get("energy")!.reason
    ).toBe("buyers_elsewhere");
  });
});
