import { describe, expect, it, vi } from "vitest";
import {
  appliedThroughputFloor,
  computeCapitalUsage,
  perUnitAnchorAmount,
  resolveThroughputBindingInput,
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

vi.mock("@/lib/market/featureFlag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/market/featureFlag")>()),
  getMarketSystemMode: vi.fn().mockResolvedValue("clearing"),
}));

it("shows settled market sales and clears stale per-output revenue shares", async () => {
  const { buildSectorCommoditySections } = await import("./sectorDetailCommodities");
  const args = {
    sector: {
      stateId: "NY",
      pricingPosture: -0.05,
      effectivePosture: -0.05,
      soldFraction: 1,
      clearingFactor: 1,
      soldByCommodity: { energy: 1 },
      revenueShareByCommodity: { energy: 1 },
      producerSettlement: {
        turn: 100,
        producedUnits: 100,
        offeredUnits: 100,
        soldUnits: 0,
        products: [{ commodity: "energy", offeredUnits: 100, soldUnits: 0, revenue: 0 }],
      },
    },
    sectorRevenueAnchor: 1000,
    sectorLaborCostAnchor: null,
    sectorType: "energy",
    sectorCountryId: "US",
    eraUnitScale: 1,
    corporation: {},
    isCeo: false,
    commodityPrices: [],
    globalBalances: new Map(),
    nationalBalancesByCountry: new Map(),
    stateBalances: new Map(),
    tariffBlend: { globalWeight: 1, nationalWeight: 0, localWeight: 0 },
    effectiveRates: { supply: { energy: 1 }, demand: {}, isTransitioning: false },
    currentTurn: 100,
  } as unknown as Parameters<typeof buildSectorCommoditySections>[0];
  const current = await buildSectorCommoditySections(args);
  expect(current.pricing).toMatchObject({ soldFraction: 0, clearingFactor: null });
  expect(current.supplies[0]).toMatchObject({ soldFraction: 0, revenueShare: 0 });
  const previous = await buildSectorCommoditySections({ ...args, currentTurn: 101 });
  expect(previous.pricing).toMatchObject({ soldFraction: 0, clearingFactor: null });
  const old = await buildSectorCommoditySections({ ...args, currentTurn: 102 });
  expect(old.pricing).toMatchObject({ soldFraction: 1, clearingFactor: 1 });
});
