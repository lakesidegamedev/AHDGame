import { describe, it, expect } from "vitest";
import {
  aggregateTechEffects,
  techEffectCategory,
  describeTechEffect,
  TECH_PLANT_OUTPUT_CAP,
  TECH_INPUT_EFFICIENCY_CAP,
  TECH_GROWTH_REDUCTION_CAP,
  TECH_LABOR_REDUCTION_CAP,
  type TechEffect,
} from "./effects";

describe("aggregateTechEffects", () => {
  it("caps plant output and folds it into every output rate", () => {
    const effects: TechEffect[] = Array.from({ length: 6 }, () => ({
      kind: "plantOutput" as const,
      pct: 0.03,
    }));
    const agg = aggregateTechEffects([
      ...effects,
      { kind: "outputRate", commodity: "steel", pct: 0.1 },
    ]);
    expect(agg.plantOutputBonus).toBe(TECH_PLANT_OUTPUT_CAP);
    expect(agg.outputRateMult.electronics).toBeCloseTo(1 + TECH_PLANT_OUTPUT_CAP);
    expect(agg.outputRateMult.steel).toBeCloseTo(1.1 * (1 + TECH_PLANT_OUTPUT_CAP));
  });

  it("caps input efficiency and folds it into every input rate", () => {
    const agg = aggregateTechEffects([
      { kind: "inputEfficiency", pct: 0.2 },
      { kind: "inputEfficiency", pct: 0.2 },
      { kind: "inputCost", commodity: "coal", pct: 0.5 },
    ]);
    expect(agg.inputEfficiencyBonus).toBe(TECH_INPUT_EFFICIENCY_CAP);
    expect(agg.inputRateMult.steel).toBeCloseTo(1 - TECH_INPUT_EFFICIENCY_CAP);
    expect(agg.inputRateMult.coal).toBeCloseTo(0.5 * (1 - TECH_INPUT_EFFICIENCY_CAP));
  });

  it("leaves the rate maps empty with no plant-wide effects", () => {
    const agg = aggregateTechEffects([{ kind: "laborCostReduction", pct: 0.1 }]);
    expect(agg.outputRateMult).toEqual({});
    expect(agg.inputRateMult).toEqual({});
  });

  it("caps growth reduction", () => {
    const agg = aggregateTechEffects([
      { kind: "growthCostReduction", pct: 0.5 },
      { kind: "growthCostReduction", pct: 0.5 },
    ]);
    expect(agg.growthCostMultiplier).toBeCloseTo(1 - TECH_GROWTH_REDUCTION_CAP);
  });

  it("sums labor-cost reduction into a multiplier and caps it", () => {
    expect(aggregateTechEffects([]).laborCostMultiplier).toBe(1);
    const partial = aggregateTechEffects([
      { kind: "laborCostReduction", pct: 0.05 },
      { kind: "laborCostReduction", pct: 0.1 },
    ]);
    expect(partial.laborCostMultiplier).toBeCloseTo(0.85);
    const capped = aggregateTechEffects([
      { kind: "laborCostReduction", pct: 0.4 },
      { kind: "laborCostReduction", pct: 0.4 },
    ]);
    expect(capped.laborCostMultiplier).toBeCloseTo(1 - TECH_LABOR_REDUCTION_CAP);
  });

  it("describes and categorizes the labor-cost effect", () => {
    expect(describeTechEffect({ kind: "laborCostReduction", pct: 0.1 })).toContain("labor cost");
    expect(techEffectCategory("laborCostReduction")).toBe("growth");
  });

  it("builds per-commodity input (down) and output (up) multipliers", () => {
    const agg = aggregateTechEffects([
      { kind: "inputCost", commodity: "oil", pct: 0.5 },
      { kind: "inputCost", commodity: "oil", pct: 0.5 }, // stacks multiplicatively → 0.25
      { kind: "outputRate", commodity: "energy", pct: 0.1 },
    ]);
    expect(agg.inputRateMult.oil).toBeCloseTo(0.25);
    expect(agg.outputRateMult.energy).toBeCloseTo(1.1);
  });

  it("sums and caps the shield effects", () => {
    const agg = aggregateTechEffects([
      { kind: "dominanceShield", pct: 0.25 },
      { kind: "dominanceShield", pct: 0.5 }, // 0.75 → capped
      { kind: "tariffShield", pct: 0.3 },
      { kind: "expansionDiscount", pct: 0.2 },
    ]);
    expect(agg.dominanceShield).toBe(0.6); // TECH_SHIELD_CAP
    expect(agg.tariffShield).toBeCloseTo(0.3);
    expect(agg.expansionDiscount).toBeCloseTo(0.2);
  });
});

describe("effect display", () => {
  it("categorizes each kind for the UI icon", () => {
    expect(techEffectCategory("inputCost")).toBe("input");
    expect(techEffectCategory("outputRate")).toBe("output");
    expect(techEffectCategory("plantOutput")).toBe("output");
    expect(techEffectCategory("inputEfficiency")).toBe("input");
  });
  it("describes the new commodity effects readably", () => {
    expect(describeTechEffect({ kind: "inputCost", commodity: "oil", pct: 0.5 })).toBe(
      "−50% oil input"
    );
    expect(describeTechEffect({ kind: "outputRate", commodity: "natural_gas", pct: 0.1 })).toBe(
      "+10% natural gas output"
    );
  });
  it("describes the shield effects", () => {
    expect(describeTechEffect({ kind: "dominanceShield", pct: 0.25 })).toBe(
      "−25% market-dominance toll on new capacity"
    );
    expect(techEffectCategory("dominanceShield")).toBe("dominance");
    expect(techEffectCategory("expansionDiscount")).toBe("expansion");
  });

  it("describes the plants-economy effect of the four reworked upgrades", () => {
    expect(describeTechEffect({ kind: "growthCostReduction", pct: 0.2 })).toBe(
      "−20% capacity build cost, −12% build time"
    );
    expect(describeTechEffect({ kind: "plantOutput", pct: 0.013 })).toBe("+1.3% plant output");
    expect(describeTechEffect({ kind: "inputEfficiency", pct: 0.06 })).toBe("−6% plant inputs");
    expect(describeTechEffect({ kind: "logisticsStrength", flat: 25 })).toContain(
      "cheaper freight and landed inputs"
    );
  });
});
