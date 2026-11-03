import { describe, expect, it } from "vitest";
import { producerRecipe } from "./recipeRules";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import {
  getEffectiveStrategyRatesForOperatingModel,
  SECTOR_STRATEGIES,
} from "@/lib/constants/sectorStrategies";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporations";

describe("physical producer recipes", () => {
  it("uses one base-value output basis for every sector, including finance, in both eras", () => {
    for (const preset of ["1991-default", "2019-default"]) {
      for (const lane of OPERATING_SECTOR_TYPES) {
        for (const strategy of SECTOR_STRATEGIES[lane]) {
          if (strategy.minDecade != null && Number(strategy.minDecade) > Number(preset.slice(0, 4)))
            continue;
          const rates = getEffectiveStrategyRatesForOperatingModel(
            lane,
            strategy.id,
            undefined,
            undefined,
            0,
            undefined,
            undefined,
            preset
          );
          for (const eraUnitScale of [1, 3.75]) {
            const recipe = producerRecipe({ ...rates, eraUnitScale });
            const outputValueBasis = Object.values(rates.supply).reduce<number>(
              (sum, rate) => sum + (rate ?? 0),
              0
            );
            expect(
              recipe.outputs.reduce(
                (sum, row) =>
                  sum +
                  (row.unitsPerOutput *
                    recipe.unitsPerNominalAnchor *
                    COMMODITY_BASE_PRICES[row.commodity]) /
                    eraUnitScale,
                0
              )
            ).toBeCloseTo(1, 12);
            expect(recipe.outputs.reduce((sum, row) => sum + row.unitsPerOutput, 0)).toBeCloseTo(
              1,
              12
            );
            for (const row of [...recipe.inputs, ...recipe.outputs]) {
              const rate = (recipe.inputs.includes(row) ? rates.demand : rates.supply)[
                row.commodity
              ]!;
              expect(row.unitsPerOutput * recipe.unitsPerNominalAnchor).toBeCloseTo(
                ((rate / COMMODITY_BASE_PRICES[row.commodity]) * eraUnitScale) /
                  (recipe.inputs.includes(row) ? 1 : outputValueBasis),
                12
              );
            }
          }
        }
      }
    }
  });

  it("keeps technology yield separate from the original nominal basket", () => {
    const base = producerRecipe({
      supply: { steel: 0.5 },
      demand: { iron: 0.2 },
      eraUnitScale: 1,
    });
    const improved = producerRecipe({
      supply: { steel: 1 },
      demand: { iron: 0.2 },
      eraUnitScale: 1,
      outputRateValueBasis: 0.5,
    });
    expect(improved.unitsPerNominalAnchor).toBe(base.unitsPerNominalAnchor * 2);
    expect(improved.outputs).toEqual(base.outputs);
    expect(improved.inputs[0].unitsPerOutput).toBeCloseTo(base.inputs[0].unitsPerOutput / 2, 12);
  });

  it("rejects unpriced, empty and nonfinite physical recipes", () => {
    expect(() => producerRecipe({ supply: {}, demand: {}, eraUnitScale: 1 })).toThrow(
      "physical output"
    );
    expect(() => producerRecipe({ supply: { food: 1 }, demand: {}, eraUnitScale: 0 })).toThrow(
      "unit scale"
    );
    expect(() => producerRecipe({ supply: { food: NaN }, demand: {}, eraUnitScale: 1 })).toThrow(
      "commodity recipe"
    );
  });
  it("pays extraction materials only for the resource share the state can supply", () => {
    const supply = { oil: 0.58, natural_gas: 0.32 };
    const demand = { energy: 0.2, steel: 0.1 };
    const outputRateValueBasis = 0.9;
    const full = producerRecipe({ supply, demand, eraUnitScale: 1, outputRateValueBasis });
    // Pennsylvania can extract gas but no oil. The input divisor still sees
    // the full recipe, so the materials bill follows the output that is kept.
    const gasOnly = producerRecipe({
      supply: { natural_gas: 0.32 },
      demand,
      eraUnitScale: 1,
      outputRateValueBasis,
      inputYieldSupply: supply,
    });
    const gasShare = 0.32 / 25 / (0.58 / 80 + 0.32 / 25);
    expect(gasOnly.unitsPerNominalAnchor / full.unitsPerNominalAnchor).toBeCloseTo(gasShare, 12);
    for (const [index, row] of gasOnly.inputs.entries()) {
      const fullRow = full.inputs[index];
      expect(row.commodity).toBe(fullRow.commodity);
      // Same material budget per output unit...
      expect(row.unitsPerOutput).toBeCloseTo(fullRow.unitsPerOutput, 12);
      // ...times the output the site keeps: 0.638 of the full-resource bill.
      expect(
        row.unitsPerOutput * (gasOnly.unitsPerNominalAnchor / full.unitsPerNominalAnchor)
      ).toBeCloseTo(fullRow.unitsPerOutput * gasShare, 12);
    }
  });

  it("leaves coefficients unchanged when every resource is available", () => {
    const supply = { oil: 0.58, natural_gas: 0.32 };
    const demand = { energy: 0.2, steel: 0.1 };
    const plain = producerRecipe({ supply, demand, eraUnitScale: 1 });
    const explicit = producerRecipe({
      supply,
      demand,
      eraUnitScale: 1,
      inputYieldSupply: supply,
    });
    expect(explicit.inputs).toEqual(plain.inputs);
    expect(explicit.outputs).toEqual(plain.outputs);
    expect(explicit.unitsPerNominalAnchor).toBe(plain.unitsPerNominalAnchor);
  });

  it("keeps non-extraction recipes on the default supply basket", () => {
    const supply = { steel: 0.5 };
    const demand = { iron: 0.2 };
    const plain = producerRecipe({ supply, demand, eraUnitScale: 1 });
    const same = producerRecipe({ supply, demand, eraUnitScale: 1, inputYieldSupply: supply });
    expect(same.inputs).toEqual(plain.inputs);
    expect(same.outputs).toEqual(plain.outputs);
    expect(same.nominalAnchorPerCapacityUnit).toBe(plain.nominalAnchorPerCapacityUnit);
  });

  it("scales missing-resource materials by the resource share, not the technology multiplier", () => {
    const demand = { energy: 0.2 };
    const outputRateValueBasis = 0.9;
    // Gas output is doubled by technology; oil is unchanged. The site has gas only.
    const techSupply = { oil: 0.58, natural_gas: 0.64 };
    const all = producerRecipe({
      supply: techSupply,
      demand,
      eraUnitScale: 1,
      outputRateValueBasis,
      inputYieldSupply: techSupply,
    });
    const gasOnly = producerRecipe({
      supply: { natural_gas: 0.64 },
      demand,
      eraUnitScale: 1,
      outputRateValueBasis,
      inputYieldSupply: techSupply,
    });
    const gasShare = 0.64 / 25 / (0.58 / 80 + 0.64 / 25);
    expect(gasOnly.unitsPerNominalAnchor / all.unitsPerNominalAnchor).toBeCloseTo(gasShare, 12);
    expect(gasOnly.inputs[0].unitsPerOutput).toBeCloseTo(all.inputs[0].unitsPerOutput, 12);
    expect(
      gasOnly.inputs[0].unitsPerOutput * (gasOnly.unitsPerNominalAnchor / all.unitsPerNominalAnchor)
    ).toBeCloseTo(all.inputs[0].unitsPerOutput * gasShare, 12);
  });
});
