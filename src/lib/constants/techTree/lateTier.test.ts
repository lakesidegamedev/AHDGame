import { describe, expect, it } from "vitest";
import { getStrategy } from "../sectorStrategies";
import { COMMODITY_TYPES } from "../commodities";
import { getStrategyAvailability, isUngatedStrategy } from "./strategyAvailability";
import { sectorNodeId, TECH_TREE, DECADE_COST } from "./nodes";
import type { TechCorpView } from "./selectors";
import { getSectorTechEffectsForYear } from "./selectors";
import { aggregateTechEffects, NEUTRAL_TECH_EFFECTS, TECH_PLANT_OUTPUT_CAP } from "./effects";
import { countsAsFrontierResearch, isBreakthroughReached } from "./breakthrough";
import {
  FRONTIER_COST_GROWTH,
  FRONTIER_INPUT_PCT,
  FRONTIER_OUTPUT_PCT,
  frontierDecadeId,
  frontierProgrammeCost,
  frontierProgrammeEffects,
  isFrontierOpen,
} from "./frontier";
import {
  SUNSET_CONVERSION_DISCOUNT,
  SUNSET_PENALTY_CAP,
  SUNSET_PENALTY_PER_YEAR,
  isSunsetConversion,
  sunsetOperatingPenalty,
  sunsetRetoolCostMultiplier,
  sunsetSuccessorFor,
  withSunsetPenalty,
} from "./sunset";
import { SECTOR_STRATEGIES } from "../sectorStrategyDefinitions";

const fusion = getStrategy("energy", "fusion_commercial");
const energyStandard = getStrategy("energy", "standard");
const withFusionNode: TechCorpView = {
  type: "energy",
  unlockedTechNodeIds: [sectorNodeId("energy", "2049", 1)],
};

describe("tier 2049 breakthrough methods", () => {
  it("every 2049 method needs a tech unlock, the 2049 tier and a research threshold", () => {
    const methods = Object.values(SECTOR_STRATEGIES)
      .flat()
      .filter((s) => s.minDecade === "2049");
    expect(methods.map((s) => s.id).sort()).toEqual([
      "autonomous_districts",
      "fusion_commercial",
      "gene_therapy_scale",
      "neural_interfaces",
      "space_resources",
    ]);
    for (const method of methods) {
      expect(method.requiresTechUnlock, method.id).toBe(true);
      expect(method.researchThreshold, method.id).toBeGreaterThan(0);
      // No method is free: every one buys at least three inputs.
      expect(Object.keys(method.demand).length, method.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("stays closed before 2049 even with the node and the research", () => {
    expect(
      getStrategyAvailability(withFusionNode, fusion, 2048, true, { sectorResearch: 1e9 })
    ).toMatchObject({ locked: true, reason: "era" });
  });

  it("stays closed in 2049 until world research reaches the threshold", () => {
    const threshold = fusion.researchThreshold!;
    expect(getStrategyAvailability(withFusionNode, fusion, 2051, true)).toMatchObject({
      locked: true,
      reason: "research",
    });
    expect(
      getStrategyAvailability(withFusionNode, fusion, 2051, true, {
        sectorResearch: threshold - 1,
      })
    ).toMatchObject({ locked: true, reason: "research" });
    expect(
      getStrategyAvailability(withFusionNode, fusion, 2051, true, { sectorResearch: threshold })
    ).toEqual({ locked: false });
  });

  it("still needs the corporation's own unlock node", () => {
    expect(
      getStrategyAvailability({ type: "energy" }, fusion, 2051, true, { sectorResearch: 1e9 })
    ).toMatchObject({ locked: true, reason: "tech" });
  });

  it("is kept out of automated pickers that skip the tech check", () => {
    expect(isUngatedStrategy(getStrategy("extraction", "space_resources"))).toBe(false);
    expect(isUngatedStrategy(getStrategy("extraction", "iron_mining"))).toBe(true);
    // Extraction's first entry stays the lane default for index fallbacks.
    expect(SECTOR_STRATEGIES.extraction[0].id).toBe("standard");
  });

  it("counts research from the 2039 tier onward only", () => {
    expect(countsAsFrontierResearch("2029")).toBe(false);
    expect(countsAsFrontierResearch("2039")).toBe(true);
    expect(countsAsFrontierResearch("2049")).toBe(true);
    expect(isBreakthroughReached({}, undefined)).toBe(true);
  });
});

describe("frontier programmes", () => {
  const lastTier = frontierDecadeId();
  const sectorBaseline = TECH_TREE.energy
    .filter((n) => n.decadeId === lastTier && n.lane === "sector" && n.slot <= 9)
    .map((n) => n.id);

  it("open only after the whole baseline of the last tier's committed lane", () => {
    expect(lastTier).toBe("2049");
    const partial = {
      unlockedTechNodeIds: sectorBaseline.slice(0, 8),
      techDecadeLane: { [lastTier]: "sector" as const },
    };
    const full = { ...partial, unlockedTechNodeIds: sectorBaseline };
    expect(isFrontierOpen(partial, "energy", 2052)).toBe(false);
    expect(isFrontierOpen(full, "energy", 2052)).toBe(true);
    expect(isFrontierOpen(full, "energy", 2048)).toBe(false);
  });

  it("costs 15% more per previous programme", () => {
    const base = DECADE_COST[lastTier] * 2;
    expect(frontierProgrammeCost(0)).toBe(base);
    expect(frontierProgrammeCost(1)).toBe(Math.round(base * (1 + FRONTIER_COST_GROWTH)));
    expect(frontierProgrammeCost(10)).toBe(Math.round(base * Math.pow(1.15, 10)));
    expect(frontierProgrammeCost(5)).toBeGreaterThan(frontierProgrammeCost(4));
  });

  it("adds +0.4% output or -0.6% inputs each, inside the aggregate caps", () => {
    const one = aggregateTechEffects(frontierProgrammeEffects({ output: 1, input: 1 }));
    expect(one.plantOutputBonus).toBeCloseTo(FRONTIER_OUTPUT_PCT);
    expect(one.inputEfficiencyBonus).toBeCloseTo(FRONTIER_INPUT_PCT);
    const huge = aggregateTechEffects(frontierProgrammeEffects({ output: 1000, input: 1000 }));
    expect(huge.plantOutputBonus).toBe(TECH_PLANT_OUTPUT_CAP);
    expect(huge.inputEfficiencyBonus).toBeLessThanOrEqual(0.3);
  });

  it("apply to the primary sector only and never expire", () => {
    const corp: TechCorpView = { type: "energy", frontierProgrammes: { output: 5 } };
    expect(getSectorTechEffectsForYear(corp, "energy", 2080).plantOutputBonus).toBeCloseTo(0.02);
    expect(getSectorTechEffectsForYear(corp, "technology", 2080).plantOutputBonus).toBe(0);
  });
});

describe("method sunsets", () => {
  it("energy conventional retires in 2039 for advanced fission or renewables", () => {
    expect(energyStandard.sunsetDecade).toBe("2039");
    expect(energyStandard.successorIds).toEqual(["advanced_fission", "renewables"]);
    expect(getStrategy("manufacturing_vehicles", "standard").sunsetDecade).toBe("2049");
  });

  it("closes the method to new sites and retools from the sunset tier", () => {
    const corp: TechCorpView = { type: "energy" };
    expect(getStrategyAvailability(corp, energyStandard, 2038, true)).toEqual({ locked: false });
    expect(getStrategyAvailability(corp, energyStandard, 2039, true)).toMatchObject({
      locked: true,
      reason: "sunset",
    });
    // Inert with tech trees off, like every other method gate.
    expect(getStrategyAvailability(corp, energyStandard, 2045, false)).toEqual({
      locked: false,
    });
  });

  it("penalises existing sites with a rising, capped operating penalty", () => {
    expect(sunsetOperatingPenalty(energyStandard, 2038)).toBe(0);
    expect(sunsetOperatingPenalty(energyStandard, 2039)).toBeCloseTo(SUNSET_PENALTY_PER_YEAR);
    expect(sunsetOperatingPenalty(energyStandard, 2042)).toBeCloseTo(4 * SUNSET_PENALTY_PER_YEAR);
    expect(sunsetOperatingPenalty(energyStandard, 2090)).toBe(SUNSET_PENALTY_CAP);
    expect(sunsetOperatingPenalty(getStrategy("energy", "renewables"), 2090)).toBe(0);
  });

  it("raises every input of a sunset site and none of a converted one", () => {
    const penalised = withSunsetPenalty(NEUTRAL_TECH_EFFECTS, "energy", "standard", 2042);
    for (const commodity of COMMODITY_TYPES) {
      expect(penalised.inputRateMult[commodity], commodity).toBeCloseTo(
        1 + 4 * SUNSET_PENALTY_PER_YEAR
      );
    }
    expect(penalised.outputRateMult).toEqual({});
    // A null strategy is the lane default.
    expect(withSunsetPenalty(NEUTRAL_TECH_EFFECTS, "energy", null, 2042)).toEqual(penalised);
    expect(withSunsetPenalty(NEUTRAL_TECH_EFFECTS, "energy", "renewables", 2042)).toBe(
      NEUTRAL_TECH_EFFECTS
    );
  });

  it("discounts the retool fee only for a sunset method moving to a named successor", () => {
    expect(isSunsetConversion(energyStandard, "renewables", 2040)).toBe(true);
    expect(sunsetRetoolCostMultiplier(energyStandard, "renewables", 2040)).toBeCloseTo(
      1 - SUNSET_CONVERSION_DISCOUNT
    );
    expect(sunsetRetoolCostMultiplier(energyStandard, "nuclear", 2040)).toBe(1);
    expect(sunsetRetoolCostMultiplier(energyStandard, "renewables", 2038)).toBe(1);
  });

  it("picks the first open successor", () => {
    const strategies = SECTOR_STRATEGIES.energy;
    expect(sunsetSuccessorFor(energyStandard, strategies, 2040, () => true)?.id).toBe(
      "advanced_fission"
    );
    expect(
      sunsetSuccessorFor(energyStandard, strategies, 2040, (s) => s.id !== "advanced_fission")?.id
    ).toBe("renewables");
    expect(sunsetSuccessorFor(energyStandard, strategies, 2038, () => true)).toBeNull();
  });
});
