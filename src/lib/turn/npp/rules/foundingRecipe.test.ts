import { describe, expect, it } from "vitest";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategies";
import type { CommodityType } from "@/lib/constants/commodities";
import {
  chooseFoundingRecipe,
  FOUNDING_RECIPE_MIN_ADVANTAGE,
  recipePeakShortageScore,
  strategyPriceScore,
} from "./foundingRecipe";

const chemical = SECTOR_STRATEGIES.chemical_industries;
const prices =
  (ratios: Partial<Record<CommodityType, number>>) =>
  (commodity: CommodityType): number | null =>
    ratios[commodity] ?? 1;
const all = () => true;

describe("chooseFoundingRecipe", () => {
  it("picks fertilizers when fertilizers are short and chemicals glutted", () => {
    expect(
      chooseFoundingRecipe({
        recipes: chemical,
        countryId: "RU",
        priceRatioOf: prices({ fertilizers: 3, chemicals: 0.6 }),
        isAvailable: all,
      })
    ).toBe("fertilizers");
  });

  it("stays on standard when nothing is short", () => {
    expect(
      chooseFoundingRecipe({
        recipes: chemical,
        countryId: "RU",
        priceRatioOf: prices({}),
        isAvailable: all,
      })
    ).toBeUndefined();
    // Cheap inputs alone are no reason to leave standard: no output is short.
    expect(
      chooseFoundingRecipe({
        recipes: chemical,
        countryId: "RU",
        priceRatioOf: prices({ oil: 0.1, electronics: 0.1, software: 0.1 }),
        isAvailable: all,
      })
    ).toBeUndefined();
  });

  it("needs a clear advantage over standard", () => {
    // Plastics a little short lifts both standard and the plastics recipe.
    expect(
      chooseFoundingRecipe({
        recipes: chemical,
        countryId: "RU",
        priceRatioOf: prices({ plastics: 1.2 }),
        isAvailable: all,
      })
    ).toBeUndefined();
    expect(FOUNDING_RECIPE_MIN_ADVANTAGE).toBeGreaterThan(0);
  });

  it("skips a recipe its era has not reached", () => {
    const pharmaShort = prices({ pharmaceuticals: 4 });
    expect(
      chooseFoundingRecipe({
        recipes: chemical,
        countryId: "DE",
        priceRatioOf: pharmaShort,
        isAvailable: all,
      })
    ).toBe("pharmaceuticals");
    expect(
      chooseFoundingRecipe({
        recipes: chemical,
        countryId: "DE",
        priceRatioOf: pharmaShort,
        isAvailable: (r) => r.id !== "pharmaceuticals",
      })
    ).not.toBe("pharmaceuticals");
  });

  it("scores with the retool price score", () => {
    const fertilizers = chemical.find((r) => r.id === "fertilizers")!;
    expect(
      strategyPriceScore(fertilizers, "RU", prices({ fertilizers: 3, chemicals: 0.6 }))
    ).toBeCloseTo(0.5 * 2 + 0.1 * -0.4 - 0.1 * -0.4, 10);
  });
});

describe("recipePeakShortageScore", () => {
  it("sees outputs only a non-standard recipe makes", () => {
    const priceRatioOf = prices({ fertilizers: 3 });
    expect(
      recipePeakShortageScore({
        recipes: chemical,
        countryId: "RU",
        priceRatioOf,
        isAvailable: all,
      })
    ).toBe(3);
    expect(
      recipePeakShortageScore({
        recipes: chemical,
        countryId: "RU",
        priceRatioOf,
        isAvailable: (r) => r.id !== "fertilizers",
      })
    ).toBe(1);
  });
});
