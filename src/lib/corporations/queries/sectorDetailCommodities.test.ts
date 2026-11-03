import { describe, expect, it } from "vitest";
import {
  appliedThroughputFloor,
  computeCapitalUsage,
  perUnitAnchorAmount,
  resolveThroughputBindingInput,
  unsoldReadingsFor,
} from "@/lib/corporations/queries/sectorDetailCommodities";

describe("sector detail capital economics", () => {
  it("computes per-unit labour from an anchor-normalized total", () => {
    // A host-currency labour total must be converted before reaching this helper.
    // 37,400 ₳ / 11 output units = 3,400 ₳ per unit.
    expect(perUnitAnchorAmount(37_400, 11)).toBe(3_400);
    expect(perUnitAnchorAmount(null, 11)).toBeNull();
    expect(perUnitAnchorAmount(37_400, 0)).toBeNull();
  });

  it("distinguishes actual capacity usage from capacity coverage", () => {
    const usage = computeCapitalUsage(1_125, 11);
    expect(usage.capacityUsed).toBe(11);
    expect(usage.utilization).toBeCloseTo(11 / 1_125, 10);
  });

  it("caps actual usage at installed capacity", () => {
    const usage = computeCapitalUsage(50, 100);
    expect(usage.capacityUsed).toBe(50);
    expect(usage.utilization).toBe(1);
  });

  it("handles missing and exhausted capacity", () => {
    expect(computeCapitalUsage(null, 10)).toEqual({
      utilization: null,
      capacityUsed: null,
    });
    expect(computeCapitalUsage(0, 10)).toEqual({
      utilization: 0,
      capacityUsed: 0,
    });
  });
});

describe("sector detail throughput floor", () => {
  it("quotes the governor floor the engine applies, not the raw Leontief minimum", () => {
    // Default governor cap 0.15: an input-starved plant is pinned at 85%.
    expect(appliedThroughputFloor(0.15)).toBeCloseTo(0.85, 10);
  });

  it("falls back to the raw minimum when the governor allows deeper cuts", () => {
    expect(appliedThroughputFloor(0.8)).toBe(0.5);
    expect(appliedThroughputFloor(1)).toBe(0.5);
  });

  it("treats a malformed cap as no governor floor", () => {
    expect(appliedThroughputFloor(Number.NaN)).toBe(0.5);
  });
});

describe("sector detail throughput attribution", () => {
  it("uses the recorded bottleneck for the throttle that was actually applied", () => {
    expect(resolveThroughputBindingInput(0.85, "iron", "real_estate_services")).toBe("iron");
  });

  it("does not substitute a projected bottleneck when applied telemetry has no binding input", () => {
    expect(resolveThroughputBindingInput(0.85, null, "real_estate_services")).toBeNull();
  });

  it("uses the world projection before an applied throttle is recorded", () => {
    expect(resolveThroughputBindingInput(null, undefined, "real_estate_services")).toBe(
      "real_estate_services"
    );
  });
});

describe("sector detail unsold readings (#5450)", () => {
  const receipt = {
    turn: 9,
    products: [
      {
        commodity: "energy",
        book: "world",
        offeredUnits: 100,
        deliveredUnits: 30,
        askingUnitPrice: 12,
      },
      {
        commodity: "energy",
        book: "world",
        offeredUnits: 100,
        deliveredUnits: 30,
        askingUnitPrice: 12,
      },
    ],
  } as never;
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

  it("reads a lane with no trades as no buyers", () => {
    expect(
      unsoldReadingsFor({ isCeo: true, receipt, currentTurn: 10, laneClearingPrices: {} }).get(
        "energy"
      )!.reason
    ).toBe("no_buyers");
  });
});
