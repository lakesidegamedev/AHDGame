import { describe, expect, it } from "vitest";
import { buildLocalRevenueShareLookup } from "./reinvestCandidatePool";
import { computeMarketSharePercent } from "@/lib/corporations/marketShare";

const sector = (stateId: string, sectorType: string, revenue: number) =>
  ({
    stateId,
    sectorType,
    revenue,
  }) as never;

describe("buildLocalRevenueShareLookup", () => {
  it("reads each sector's revenue share of its (region, lane) bucket, the player pricing basis", () => {
    const a = sector("CA", "manufacturing", 300);
    const b = sector("CA", "manufacturing", 100);
    const lookup = buildLocalRevenueShareLookup([a, b]);
    expect(lookup(a)).toBeCloseTo(computeMarketSharePercent(300, 400), 9);
    expect(lookup(b)).toBeCloseTo(25, 9);
    expect(lookup(a) + lookup(b)).toBeCloseTo(100, 9);
  });

  it("gives a sole producer the whole bucket and keeps buckets independent", () => {
    const solo = sector("TX", "retail", 50);
    const other = sector("TX", "manufacturing", 999);
    const vehicles = sector("TX", "manufacturing", 1, "vehicles");
    const lookup = buildLocalRevenueShareLookup([solo, other, vehicles]);
    expect(lookup(solo)).toBe(100);
    expect(lookup(other)).toBe(100);
    expect(lookup(vehicles)).toBe(100);
  });

  it("reads zero for a bucket with no revenue", () => {
    const idle = sector("NY", "retail", 0);
    expect(buildLocalRevenueShareLookup([idle])(idle)).toBe(0);
  });
});
