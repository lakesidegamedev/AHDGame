import { describe, expect, it } from "vitest";
import { NEUTRAL_TECH_EFFECTS } from "@/lib/constants/techTree";
import {
  AGING_PENALTY_CAP,
  COAL_PHASE_OUT_PENALTY_AT_DEADLINE,
  MAX_POLICY_EMISSIONS_CUT,
  MAX_RENEWABLES_RELIABILITY_PENALTY,
  NO_TRANSITION_POLICY,
  agingMaintenancePenalty,
  applyTransitionAdjustment,
  blendVintageYear,
  carbonPriceInputPenalty,
  cleanPowerShare,
  cleanPowerStandardPenalty,
  coalPhaseOutPenalty,
  legacyOptionLevel,
  openingVintageYear,
  policyEmissionsCut,
  prospectDepletionMultiplier,
  rareEarthRecoveryShare,
  regionalPowerMix,
  renewablesReliabilityPenalty,
  sectorTransitionAdjustment,
} from "./rules";

describe("renewables reliability", () => {
  it("costs pure renewables with no firming the full penalty", () => {
    const mix = regionalPowerMix([{ strategyId: "renewables", capacity: 100 }]);
    expect(renewablesReliabilityPenalty(mix)).toBeCloseTo(MAX_RENEWABLES_RELIABILITY_PENALTY);
  });

  it("is lifted by storage at the target ratio and halved by half of it", () => {
    const full = regionalPowerMix([
      { strategyId: "renewables", capacity: 100 },
      { strategyId: "grid_storage_utility", capacity: 25 },
    ]);
    expect(renewablesReliabilityPenalty(full)).toBe(0);
    // Smart grid firms at half weight: 25 units firm like 12.5 of storage.
    const half = regionalPowerMix([
      { strategyId: "renewables", capacity: 100 },
      { strategyId: "smart_grid", capacity: 25 },
    ]);
    expect(renewablesReliabilityPenalty(half)).toBeCloseTo(MAX_RENEWABLES_RELIABILITY_PENALTY / 2);
  });

  it("costs nothing where renewables are a small share of the grid", () => {
    const mix = regionalPowerMix([
      { strategyId: "renewables", capacity: 20 },
      { strategyId: "standard", capacity: 80 },
    ]);
    expect(renewablesReliabilityPenalty(mix)).toBe(0);
    expect(renewablesReliabilityPenalty(regionalPowerMix([]))).toBe(0);
  });
});

describe("ageing infrastructure", () => {
  it("raises running costs only after design life: power 40 years, factories 30", () => {
    expect(agingMaintenancePenalty("energy", 2000, 2040)).toBe(0);
    expect(agingMaintenancePenalty("energy", 2000, 2050)).toBeCloseTo(0.15);
    expect(agingMaintenancePenalty("manufacturing", 2000, 2030)).toBe(0);
    expect(agingMaintenancePenalty("manufacturing", 2000, 2040)).toBeCloseTo(0.15);
    expect(agingMaintenancePenalty("energy", 1950, 2050)).toBe(AGING_PENALTY_CAP);
    expect(agingMaintenancePenalty("retail", 1950, 2050)).toBe(0);
  });

  it("dates an untracked opening fleet by type and method", () => {
    expect(openingVintageYear("energy", "standard", 2027)).toBe(1999);
    expect(openingVintageYear("energy", "renewables", 2027)).toBe(2019);
    expect(openingVintageYear("energy", "grid_storage_utility", 2027)).toBe(2027);
    expect(openingVintageYear("chemical_industries", null, 2027)).toBe(2005);
    expect(openingVintageYear("retail", null, 2027)).toBeNull();
    // Conventional power from the 2027 opening passes design life in 2039.
    expect(agingMaintenancePenalty("energy", 1999, 2039)).toBe(0);
    expect(agingMaintenancePenalty("energy", 1999, 2045)).toBeGreaterThan(0);
  });

  it("pulls the fleet's build year toward new capacity by weight", () => {
    expect(blendVintageYear(2000, 100, 2040, 100)).toBe(2020);
    expect(blendVintageYear(2000, 0, 2040, 10)).toBe(2040);
    expect(blendVintageYear(2000, 100, 2040, 0)).toBe(2000);
  });
});

describe("climate laws", () => {
  it("prices carbon on fossil power and heavy industry, not clean power", () => {
    expect(carbonPriceInputPenalty(0, "energy", "standard")).toBe(0);
    const coal = carbonPriceInputPenalty(3, "energy", "standard");
    expect(coal).toBeGreaterThan(0);
    expect(carbonPriceInputPenalty(4, "energy", "standard")).toBeGreaterThan(coal);
    expect(carbonPriceInputPenalty(3, "energy", "fracking")).toBeLessThan(coal);
    expect(carbonPriceInputPenalty(3, "chemical_industries", "standard")).toBeGreaterThan(0);
    expect(carbonPriceInputPenalty(4, "energy", "renewables")).toBe(0);
    expect(carbonPriceInputPenalty(4, "energy", "nuclear")).toBe(0);
    expect(carbonPriceInputPenalty(4, "media", null)).toBe(0);
  });

  it("ramps coal closure costs over the decade before the deadline", () => {
    // Level 2 closes coal in 2040.
    expect(coalPhaseOutPenalty(2, 2029, "energy", "standard")).toBe(0);
    expect(coalPhaseOutPenalty(2, 2035, "energy", "standard")).toBeCloseTo(
      COAL_PHASE_OUT_PENALTY_AT_DEADLINE / 2
    );
    expect(coalPhaseOutPenalty(2, 2045, "energy", "standard")).toBe(
      COAL_PHASE_OUT_PENALTY_AT_DEADLINE
    );
    expect(coalPhaseOutPenalty(2, 2045, "energy", "renewables")).toBe(0);
    expect(coalPhaseOutPenalty(0, 2045, "energy", "standard")).toBe(0);
  });

  it("charges fossil power for the gap to the clean power standard", () => {
    const share = cleanPowerShare([
      { strategyId: "standard", capacity: 60 },
      { strategyId: "renewables", capacity: 30 },
      { strategyId: "nuclear", capacity: 10 },
    ]);
    expect(share).toBeCloseTo(0.4);
    expect(cleanPowerStandardPenalty(1, share, "energy", "standard")).toBe(0);
    expect(cleanPowerStandardPenalty(3, share, "energy", "standard")).toBeCloseTo(0.24);
    expect(cleanPowerStandardPenalty(3, share, "energy", "renewables")).toBe(0);
    expect(cleanPowerStandardPenalty(3, share, "manufacturing", "standard")).toBe(0);
  });

  it("maps legacy ladder options onto the new-generation levels", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(legacyOptionLevel)).toEqual([4, 3, 2, 0, 0, 0, 0]);
    expect(legacyOptionLevel(undefined)).toBe(0);
  });

  it("cuts emissions more the stronger the laws, within a ceiling", () => {
    expect(policyEmissionsCut(NO_TRANSITION_POLICY)).toBe(0);
    const moderate = policyEmissionsCut({ ...NO_TRANSITION_POLICY, carbonPrice: 2 });
    const strong = policyEmissionsCut({
      carbonPrice: 4,
      coalPhaseOut: 4,
      cleanPowerStandard: 4,
      mineralsRecycling: 0,
    });
    expect(moderate).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(moderate);
    expect(strong).toBeLessThanOrEqual(MAX_POLICY_EMISSIONS_CUT);
  });
});

describe("resources", () => {
  it("raises survey cost with cumulative extraction only from 2035", () => {
    expect(prospectDepletionMultiplier(500, 1000, 2034)).toBe(1);
    expect(prospectDepletionMultiplier(0, 1000, 2040)).toBe(1);
    expect(prospectDepletionMultiplier(500, 1000, 2040)).toBe(2);
    expect(prospectDepletionMultiplier(5000, 1000, 2040)).toBe(3);
    expect(prospectDepletionMultiplier(10, 0, 2040)).toBe(1);
  });

  it("recovers rare earth demand at the top two minerals law levels", () => {
    expect(rareEarthRecoveryShare(2)).toBe(0);
    expect(rareEarthRecoveryShare(3)).toBe(0.1);
    expect(rareEarthRecoveryShare(4)).toBe(0.2);
  });
});

describe("one sector's input bill", () => {
  it("stacks age and law penalties and folds recycling into rare earth", () => {
    const adjustment = sectorTransitionAdjustment({
      operatingType: "energy",
      strategyId: "standard",
      currentYear: 2045,
      policy: { carbonPrice: 3, coalPhaseOut: 0, cleanPowerStandard: 0, mineralsRecycling: 4 },
      cleanShare: 1,
      vintageYear: 1999,
    });
    expect(adjustment.inputPenalty).toBeCloseTo(
      agingMaintenancePenalty("energy", 1999, 2045) +
        carbonPriceInputPenalty(3, "energy", "standard")
    );
    expect(adjustment.rareEarthMult).toBeCloseTo(0.8);
    const effects = applyTransitionAdjustment(NEUTRAL_TECH_EFFECTS, adjustment, [
      "coal",
      "rare_earth",
    ]);
    expect(effects.inputRateMult.coal).toBeCloseTo(1 + adjustment.inputPenalty);
    expect(effects.inputRateMult.rare_earth).toBeCloseTo((1 + adjustment.inputPenalty) * 0.8);
  });

  it("leaves a clean, young sector with no laws untouched", () => {
    const adjustment = sectorTransitionAdjustment({
      operatingType: "energy",
      strategyId: "renewables",
      currentYear: 2030,
      policy: NO_TRANSITION_POLICY,
      cleanShare: 1,
      vintageYear: 2019,
    });
    expect(adjustment).toEqual({ inputPenalty: 0, rareEarthMult: 1 });
    expect(applyTransitionAdjustment(NEUTRAL_TECH_EFFECTS, adjustment, ["coal"])).toBe(
      NEUTRAL_TECH_EFFECTS
    );
  });
});
