import { describe, expect, it } from "vitest";
import {
  computeDisasterPenaltySplit,
  disasterProductionFactor,
} from "@/lib/crises/disasterMarginPenalty";
import {
  agricultureYieldLoss,
  climateEffectEntries,
  climateExposureFromTags,
  energyDemandMultiplier,
  insuranceMarginPenalty,
  uninsuredLossMultiplier,
} from "./climateEffects";

const aridHot = climateExposureFromTags(["arid", "hot"]);
const temperate = climateExposureFromTags(["wintry"]);

function farmOutput(pressure: number, strategyId: string | null): number {
  const split = computeDisasterPenaltySplit(
    climateEffectEntries(pressure, aridHot),
    { sectorType: "agriculture", strategyId },
    500,
    true
  );
  return disasterProductionFactor(split.productionPenalty);
}

describe("broader climate effects", () => {
  it("reads exposure from hazard tags, capped at 1 per channel", () => {
    expect(aridHot).toEqual({ heat: 1, dry: 1, property: 0 });
    expect(climateExposureFromTags(["coastal", "flood", "tornado"]).property).toBe(1);
    expect(climateExposureFromTags([])).toEqual({ heat: 0, dry: 0, property: 0 });
  });

  it("cuts hot, dry farm yields by up to 15% at pressure 0.6", () => {
    expect(agricultureYieldLoss(0.2, aridHot)).toBe(0);
    expect(agricultureYieldLoss(0.4, aridHot)).toBeCloseTo(0.075);
    expect(agricultureYieldLoss(0.6, aridHot)).toBeCloseTo(0.15);
    expect(agricultureYieldLoss(0.9, aridHot)).toBeCloseTo(0.15);
    expect(agricultureYieldLoss(0.6, temperate)).toBe(0);
  });

  it("lets precision and cellular agriculture offset the loss", () => {
    expect(farmOutput(0.6, "standard")).toBeCloseTo(0.85);
    expect(farmOutput(0.6, null)).toBeCloseTo(0.85);
    expect(farmOutput(0.6, "precision_ag")).toBeCloseTo(0.925);
    expect(farmOutput(0.6, "cellular_agriculture")).toBeCloseTo(1);
    expect(farmOutput(0.45, "standard")).toBeGreaterThan(farmOutput(0.6, "standard"));
  });

  it("does not decay a standing climate effect between turns", () => {
    const entries = climateEffectEntries(0.6, aridHot);
    for (const turn of [0, 48, 5_000]) {
      const split = computeDisasterPenaltySplit(
        entries,
        { sectorType: "agriculture", strategyId: "standard" },
        turn,
        true
      );
      expect(split.productionPenalty).toBeCloseTo(-15);
    }
  });

  it("adds 5% household energy demand in hot regions at pressure 0.5", () => {
    expect(energyDemandMultiplier(0.2, aridHot)).toBe(1);
    expect(energyDemandMultiplier(0.5, aridHot)).toBeCloseTo(1.05);
    expect(energyDemandMultiplier(1, aridHot)).toBeCloseTo(1.1);
    expect(energyDemandMultiplier(0.5, temperate)).toBe(1);
  });

  it("raises property and farm insurance costs and the uninsured share of losses", () => {
    const coast = climateExposureFromTags(["coastal", "flood"]);
    expect(insuranceMarginPenalty(0.2, coast, "real_estate")).toBe(0);
    expect(insuranceMarginPenalty(0.6, coast, "real_estate")).toBeCloseTo(-2);
    expect(insuranceMarginPenalty(0.6, aridHot, "agriculture")).toBeCloseTo(-1.5);
    expect(insuranceMarginPenalty(0.6, coast, "technology")).toBe(0);
    expect(uninsuredLossMultiplier(0.2, coast)).toBe(1);
    expect(uninsuredLossMultiplier(0.6, coast)).toBeCloseTo(1.5);
    expect(uninsuredLossMultiplier(0.6, temperate)).toBeCloseTo(1.05);
  });

  it("emits nothing below the opening pressure", () => {
    expect(climateEffectEntries(0.2, climateExposureFromTags(["arid", "coastal"]))).toEqual([]);
  });
});
