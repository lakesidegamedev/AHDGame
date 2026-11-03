import { describe, expect, it } from "vitest";
import type { CommodityType } from "@/lib/constants/commodities";
import { sectorPeakShortageScore } from "./marketSignals";
import {
  foundingLanePeakShortage,
  foundingRecipeAvailable,
  foundingRecipeFor,
} from "./foundingRecipeChoice";
import { foundingSectorWeights } from "./foundingSectorChoice";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategies";

const prices =
  (ratios: Partial<Record<CommodityType, number>>) =>
  (commodity: CommodityType): number | null =>
    ratios[commodity] ?? 1;
const modern = { currentYear: 2019, techTreesEnabled: false };

describe("foundingRecipeFor", () => {
  it("founds a chemical plant on fertilizers when fertilizers are short", () => {
    const priceRatioOf = prices({ fertilizers: 3, chemicals: 0.6 });
    expect(foundingRecipeFor("chemical_industries", "RU", priceRatioOf, modern)).toBe(
      "fertilizers"
    );
  });

  it("stays standard with nothing short", () => {
    expect(foundingRecipeFor("chemical_industries", "RU", prices({}), modern)).toBeUndefined();
  });

  it("respects the era gate even with tech trees off", () => {
    const pharma = SECTOR_STRATEGIES.chemical_industries.find((r) => r.id === "pharmaceuticals")!;
    expect(foundingRecipeAvailable("chemical_industries", modern)(pharma)).toBe(true);
    expect(
      foundingRecipeAvailable("chemical_industries", {
        currentYear: 1900,
        techTreesEnabled: false,
      })(pharma)
    ).toBe(false);
    expect(
      foundingRecipeFor("chemical_industries", "DE", prices({ pharmaceuticals: 4 }), {
        currentYear: 1900,
        techTreesEnabled: false,
      })
    ).not.toBe("pharmaceuticals");
  });

  it("never steers a mine", () => {
    expect(
      foundingRecipeFor("extraction", "RU", prices({ rare_earth: 5 }), modern)
    ).toBeUndefined();
  });
});

describe("recipe-aware founding weights", () => {
  it("lets a fertilizers shortage draw chemical foundings", () => {
    const priceRatioOf = prices({ fertilizers: 3, chemicals: 0.6 });
    expect(sectorPeakShortageScore("chemical_industries", "RU", priceRatioOf)).toBe(1);
    expect(foundingLanePeakShortage("chemical_industries", "RU", priceRatioOf, modern)).toBe(3);
    const types = ["chemical_industries", "retail"] as const;
    const base = { types, countryId: "RU", priceRatioOf, existingCount: () => 0 };
    const legacy = foundingSectorWeights(base);
    const funded = foundingSectorWeights({
      ...base,
      peakShortageOf: (type) => foundingLanePeakShortage(type, "RU", priceRatioOf, modern),
    });
    expect(legacy[0]).toBe(legacy[1]);
    expect(funded[0]).toBeGreaterThan(funded[1] * 5);
  });
});
