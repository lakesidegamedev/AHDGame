import { describe, expect, it } from "vitest";
import { getCountryLayer1Model, buildModelRegionDemographics } from "@/lib/seeds/international";
import { modelRegionLean } from "@/lib/seeds/international/modelRegionLean";
import { caRegions2027 } from "./data/caRegions2027";
import { CA_LAYER1_DIMS } from "./layer1Model";

const model = getCountryLayer1Model("CA", "2027")!;

describe("Canada Layer-1 electorate model", () => {
  it("exists for 2027 only", () => {
    expect(model).not.toBeNull();
    for (const era of ["1953", "1979", "1991", "2019", "2023"] as const) {
      expect(getCountryLayer1Model("CA", era), era).toBeNull();
    }
  });

  it("covers every province and territory", () => {
    expect(Object.keys(model.census).sort()).toEqual(caRegions2027.map((r) => r._id).sort());
  });

  it("gives every census bucket a position and a turnout rate", () => {
    for (const census of Object.values(model.census)) {
      expect(Object.keys(census).sort()).toEqual([...CA_LAYER1_DIMS].sort());
      for (const dim of CA_LAYER1_DIMS) {
        const total = Object.values(census[dim]!).reduce((sum, share) => sum + share, 0);
        expect(total).toBeGreaterThanOrEqual(98);
        expect(total).toBeLessThanOrEqual(102);
        for (const bucket of Object.keys(census[dim]!)) {
          expect(model.positions[dim]?.[bucket], `${dim}:${bucket}`).toBeDefined();
          expect(model.turnoutRates[dim]?.[bucket], `${dim}:${bucket}`).toBeDefined();
        }
      }
    }
  });

  it("weights every group's composition on real census buckets", () => {
    const anyRegion = Object.values(model.census)[0]!;
    for (const groupId of model.groupIds) {
      for (const { dim, key } of model.composition[groupId]!.weights) {
        expect(anyRegion[dim]?.[key], `${groupId} ${dim}:${key}`).toBeDefined();
      }
    }
  });

  it("builds seedable voter groups that fill each region and stay on the lean scale", () => {
    const regions = buildModelRegionDemographics(model);
    expect(regions).toHaveLength(13);
    for (const region of regions) {
      const total = Object.values(region.groups).reduce((sum, g) => sum + g.population, 0);
      expect(total).toBeCloseTo(100, 0);
      for (const group of Object.values(region.groups)) {
        expect(Math.abs(group.economicLean)).toBeLessThanOrEqual(5);
        expect(Math.abs(group.socialLean)).toBeLessThanOrEqual(5);
      }
    }
  });

  it("orders regions the way the 2025 result did", () => {
    const lean = (region: string) => modelRegionLean(model, region);
    expect(lean("CA_AB").economicLean).toBeGreaterThan(lean("CA_ON").economicLean);
    expect(lean("CA_SK").economicLean).toBeGreaterThan(lean("CA_QC").economicLean);
    expect(lean("CA_QC").socialLean).toBeLessThan(lean("CA_AB").socialLean);
  });
});
