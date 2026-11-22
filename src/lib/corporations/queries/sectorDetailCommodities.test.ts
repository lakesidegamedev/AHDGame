import { describe, expect, it } from "vitest";
import {
  appliedThroughputFloor,
  computeCapitalUsage,
  outputRevenueShares,
  perUnitAnchorAmount,
  pricingAsks,
  pricingSalesReading,
  resolveThroughputBindingInput,
} from "@/lib/corporations/queries/sectorDetailCommodities";
import type { CorporateSector } from "@/lib/db/types";

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

describe("outputRevenueShares", () => {
  const clearing = { software: 0.9, electronics: 0.1 };

  it("splits a settled plant's revenue by what each product was paid", () => {
    const receipt = new Map([
      ["software", { revenue: 300 }],
      ["electronics", { revenue: 700 }],
    ]);
    expect(outputRevenueShares(receipt, clearing)).toEqual({ software: 0.3, electronics: 0.7 });
  });

  it("shows no split for a settled plant that earned nothing", () => {
    expect(outputRevenueShares(new Map([["software", { revenue: 0 }]]), clearing)).toEqual({});
  });

  it("keeps the clearing split where there is no current receipt", () => {
    expect(outputRevenueShares(null, clearing)).toBe(clearing);
    expect(outputRevenueShares(null, undefined)).toEqual({});
  });
});

describe("pricingSalesReading", () => {
  const settlement = {
    turn: 108,
    offeredUnits: 20,
    soldUnits: 20,
    revenue: 2_000,
    products: [
      {
        offeredUnits: 20,
        soldUnits: 20,
        internalDeliveredUnits: 0,
        askingUnitPrice: 100,
        revenue: 2_000,
      },
    ],
  } as unknown as CorporateSector["producerSettlement"];
  const legacy = {
    effectivePosture: -0.1,
    soldFraction: 0.12,
    clearingFactor: 0.4,
    soldByCommodityTurn: 108,
  };

  it("reads only the settlement for a funded plant and drops the legacy posture", () => {
    expect(pricingSalesReading({ ...legacy, producerSettlement: settlement }, false)).toEqual({
      salesBasis: "settlement",
      effectivePosture: null,
      soldFraction: 1,
      clearingFactor: 1,
    });
  });

  it("keeps the legacy figures, as an estimate, where there is no funded record", () => {
    expect(pricingSalesReading(legacy, true)).toEqual({
      salesBasis: "estimate",
      effectivePosture: -0.1,
      soldFraction: 0.12,
      clearingFactor: 0.4,
    });
  });

  it("reads the legacy figures when the settlement is older than them", () => {
    const older = { ...settlement, turn: 107 } as CorporateSector["producerSettlement"];
    expect(pricingSalesReading({ ...legacy, producerSettlement: older }, true).salesBasis).toBe(
      "estimate"
    );
  });
});

describe("pricingAsks", () => {
  it("weights each output's ask by units offered and reads its book's market price", () => {
    expect(
      pricingAsks(
        [
          { commodity: "software", book: "world", offeredUnits: 1, askingUnitPrice: 2000 },
          { commodity: "electronics", book: "world", offeredUnits: 3, askingUnitPrice: 400 },
          { commodity: "electronics", book: "world", offeredUnits: 1, askingUnitPrice: 600 },
          { commodity: "electronics", book: "world", offeredUnits: 0, askingUnitPrice: 9999 },
        ],
        { "electronics|world": 395 }
      )
    ).toEqual([
      { commodity: "electronics", askingUnitPrice: 450, paidUnitPrice: null, marketUnitPrice: 395 },
      { commodity: "software", askingUnitPrice: 2000, paidUnitPrice: null, marketUnitPrice: null },
    ]);
    expect(pricingAsks(undefined, undefined)).toEqual([]);
  });

  it("reports what the plant was paid on average beside the lane's clearing price", () => {
    const [row] = pricingAsks(
      [
        {
          commodity: "energy",
          book: "world",
          offeredUnits: 100,
          askingUnitPrice: 200,
          soldUnits: 50,
          revenue: 10_000,
        },
      ],
      { "energy|world": 160 }
    );
    expect(row).toEqual({
      commodity: "energy",
      askingUnitPrice: 200,
      paidUnitPrice: 200,
      marketUnitPrice: 160,
    });
  });
});
