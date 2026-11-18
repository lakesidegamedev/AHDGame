import { describe, expect, it } from "vitest";
import { SHIPPING_PRESETS } from "@/lib/world/eraRoster";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import {
  CORP_LANE_EFFECT_SCALE,
  TECH_GROWTH_REDUCTION_CAP,
  TECH_INPUT_EFFICIENCY_CAP,
  TECH_LABOR_REDUCTION_CAP,
  TECH_METHOD_OUTPUT_CAP,
  TECH_PLANT_OUTPUT_CAP,
  TECH_SHIELD_CAP,
  TECH_TREE,
  aggregateTechEffectLayers,
  aggregateTechEffects,
  autoGrantedNodeIds,
  getActiveTechDecadeIds,
  getAggregatedTechEffects,
  getSectorTechEffectBreakdown,
  getSectorTechEffects,
  getSectorTechEffectsForYear,
  getUnlockedNodes,
  getUnlockedStrategyIds,
  scaleEffect,
  type AggregatedTechEffects,
  type TechEffect,
  type TechTreeNode,
} from "@/lib/constants/techTree";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import {
  isPreStartDecade,
  preStartDecadeIds,
  resolveLegacyTechContext,
  resolveLegacyTechMode,
  type LegacyTechContext,
} from "./legacyTech";

const SECTOR_TYPES = Object.keys(TECH_TREE) as OperatingSectorType[];

const BASELINE_2027: LegacyTechContext = { startingYear: 2027, mode: "baseline" };
const OFF_2027: LegacyTechContext = { startingYear: 2027, mode: "off" };

describe("legacyTechMode", () => {
  it("reads only the exact string baseline as on; absent or anything else is off", () => {
    expect(resolveLegacyTechMode("baseline")).toBe("baseline");
    expect(resolveLegacyTechMode("off")).toBe("off");
    expect(resolveLegacyTechMode(undefined)).toBe("off");
    expect(resolveLegacyTechMode(null)).toBe("off");
    expect(resolveLegacyTechMode("Baseline")).toBe("off");
    expect(resolveLegacyTechMode(true)).toBe("off");
    expect(resolveLegacyTechContext({ startingYear: 2027, mode: undefined })).toEqual(OFF_2027);
    expect(resolveLegacyTechContext({ startingYear: 2027, mode: "baseline" })).toEqual(
      BASELINE_2027
    );
  });
});

describe("pre-start decade cutoff", () => {
  it("a 1953 world ignores 1940 only", () => {
    expect(preStartDecadeIds(1953)).toEqual(["1940"]);
    expect(isPreStartDecade("1940", 1953)).toBe(true);
    expect(isPreStartDecade("1950", 1953)).toBe(false);
    expect(isPreStartDecade("2019", 1953)).toBe(false);
  });

  it("a 2027 world ignores 1940 through 2009", () => {
    expect(preStartDecadeIds(2027)).toEqual([
      "1940",
      "1950",
      "1960",
      "1970",
      "1979",
      "1989",
      "1999",
      "2009",
    ]);
    expect(isPreStartDecade("2019", 2027)).toBe(false);
    expect(isPreStartDecade("2029", 2027)).toBe(false);
  });

  it("the earliest start has nothing pre-start", () => {
    expect(preStartDecadeIds(1940)).toEqual([]);
  });
});

describe("aggregateTechEffectLayers (the combination rule)", () => {
  const eff = (kind: TechEffect["kind"], pct: number): TechEffect =>
    ({ kind, pct }) as unknown as TechEffect;

  it("adds plant output and input efficiency, each layer capped on its own", () => {
    const out = aggregateTechEffectLayers(
      [eff("plantOutput", 0.5), eff("inputEfficiency", 0.5)],
      [eff("plantOutput", 0.5), eff("inputEfficiency", 0.5)]
    );
    expect(out.plantOutputBonus).toBeCloseTo(TECH_PLANT_OUTPUT_CAP * 2);
    expect(out.inputEfficiencyBonus).toBeCloseTo(TECH_INPUT_EFFICIENCY_CAP * 2);
    // Folded into every commodity the way the single layer always was.
    expect(out.inputRateMult.steel).toBeCloseTo(1 - TECH_INPUT_EFFICIENCY_CAP * 2);
    expect(out.outputRateMult.steel).toBeCloseTo(1 + TECH_PLANT_OUTPUT_CAP * 2);
  });

  it("a baseline that saturates a cap leaves research its full room", () => {
    const baselineOnly = aggregateTechEffectLayers([eff("inputEfficiency", 0.9)], []);
    expect(baselineOnly.inputEfficiencyBonus).toBe(TECH_INPUT_EFFICIENCY_CAP);
    const withResearch = aggregateTechEffectLayers(
      [eff("inputEfficiency", 0.9)],
      [eff("inputEfficiency", 0.1)]
    );
    expect(withResearch.inputEfficiencyBonus).toBeCloseTo(TECH_INPUT_EFFICIENCY_CAP + 0.1);
  });

  it("multiplies the cost multipliers, so two full layers never make a cost free", () => {
    const out = aggregateTechEffectLayers(
      [eff("growthCostReduction", 0.9), eff("laborCostReduction", 0.9)],
      [eff("growthCostReduction", 0.9), eff("laborCostReduction", 0.9)]
    );
    expect(out.growthCostMultiplier).toBeCloseTo((1 - TECH_GROWTH_REDUCTION_CAP) ** 2);
    expect(out.laborCostMultiplier).toBeCloseTo((1 - TECH_LABOR_REDUCTION_CAP) ** 2);
    expect(out.growthCostMultiplier).toBeGreaterThan(0);
    expect(out.laborCostMultiplier).toBeGreaterThan(0);
  });

  it("combines shields as a + b - a*b, never past 100%", () => {
    const layer = [
      eff("dominanceShield", 0.9),
      eff("tariffShield", 0.9),
      eff("expansionDiscount", 0.9),
    ];
    const out = aggregateTechEffectLayers(layer, layer);
    const expected = TECH_SHIELD_CAP + TECH_SHIELD_CAP - TECH_SHIELD_CAP * TECH_SHIELD_CAP;
    expect(out.dominanceShield).toBeCloseTo(expected);
    expect(out.tariffShield).toBeCloseTo(expected);
    expect(out.expansionDiscount).toBeCloseTo(expected);
    expect(expected).toBeLessThan(1);
  });

  it("multiplies the uncapped per-commodity rates of both layers", () => {
    const out = aggregateTechEffectLayers(
      [
        { kind: "inputCost", commodity: "steel", pct: 0.5 },
        { kind: "outputRate", commodity: "steel", pct: 0.1 },
      ],
      [
        { kind: "inputCost", commodity: "steel", pct: 0.5 },
        { kind: "outputRate", commodity: "steel", pct: 0.1 },
      ]
    );
    expect(out.inputRateMult.steel).toBeCloseTo(0.25);
    expect(out.outputRateMult.steel).toBeCloseTo(1.21);
  });

  it("keeps the frontier method cap separate", () => {
    const out = aggregateTechEffectLayers([], [{ kind: "plantOutput", pct: 0.9, method: true }]);
    expect(out.methodOutputBonus).toBe(TECH_METHOD_OUTPUT_CAP);
    expect(out.plantOutputBonus).toBe(0);
  });

  const mixed: TechEffect[] = [
    eff("plantOutput", 0.2),
    eff("inputEfficiency", 0.2),
    eff("growthCostReduction", 0.2),
    eff("laborCostReduction", 0.2),
    eff("dominanceShield", 0.2),
    { kind: "inputCost", commodity: "steel", pct: 0.1 },
    { kind: "outputRate", commodity: "steel", pct: 0.1 },
  ];

  it("with an empty baseline it equals the single-layer aggregate exactly", () => {
    expect(aggregateTechEffectLayers([], mixed)).toEqual(aggregateTechEffects(mixed));
  });

  it("with nothing researched it equals the baseline's own capped aggregate exactly", () => {
    expect(aggregateTechEffectLayers(mixed, [])).toEqual(aggregateTechEffects(mixed));
  });

  it("changes nothing when neither layer has effects", () => {
    expect(aggregateTechEffectLayers([], [])).toEqual(aggregateTechEffects([]));
  });
});

describe("owned nodes stay owned", () => {
  it("a 2027 founding still grants every earlier baseline node, and they still unlock strategies in every mode", () => {
    const type: OperatingSectorType = "energy";
    const ids = autoGrantedNodeIds(type, 2027);
    expect(ids.length).toBeGreaterThan(0);
    const corp = { type, unlockedTechNodeIds: ids };
    expect(getUnlockedNodes(corp)).toHaveLength(ids.length);
    const strategies = getUnlockedStrategyIds(corp);
    expect(strategies.length).toBeGreaterThan(0);
    getSectorTechEffects(corp, type, OFF_2027);
    getSectorTechEffects(corp, type, BASELINE_2027);
    expect(getUnlockedStrategyIds(corp)).toEqual(strategies);
  });
});

describe("layering node effects by the world's starting decade", () => {
  const type: OperatingSectorType = "energy";
  const find = (decadeId: string, lane: "sector" | "generic", kind: TechEffect["kind"]) =>
    TECH_TREE[type].find(
      (n: TechTreeNode) =>
        n.lane === lane &&
        n.decadeId === decadeId &&
        n.effects.some((e) => e.kind === kind && !(e as { method?: boolean }).method)
    );
  const legacyNode = find("2009", "sector", "plantOutput");
  const researchedNode = find("2019", "sector", "plantOutput");

  it("has nodes to test with", () => {
    expect(legacyNode).toBeDefined();
    expect(researchedNode).toBeDefined();
  });

  const legacyCorp = { type, unlockedTechNodeIds: legacyNode ? [legacyNode.id] : [] };
  const researchedCorp = { type, unlockedTechNodeIds: researchedNode ? [researchedNode.id] : [] };
  const bothCorp = {
    type,
    unlockedTechNodeIds: [legacyNode?.id, researchedNode?.id].filter((id): id is string => !!id),
  };
  const plant = (corp: typeof bothCorp, legacy: LegacyTechContext) =>
    getSectorTechEffects(corp, type, legacy).plantOutputBonus;

  it("off: a pre-start node gives nothing, a start-decade node counts", () => {
    expect(plant(legacyCorp, OFF_2027)).toBe(0);
    expect(plant(researchedCorp, OFF_2027)).toBeGreaterThan(0);
    expect(plant(bothCorp, OFF_2027)).toBeCloseTo(plant(researchedCorp, OFF_2027));
  });

  it("baseline: a pre-start node counts as before, and research adds on top", () => {
    const era = plant(legacyCorp, BASELINE_2027);
    const research = plant(researchedCorp, BASELINE_2027);
    expect(era).toBeGreaterThan(0);
    expect(plant(bothCorp, BASELINE_2027)).toBeCloseTo(era + research);
  });

  it("a world that started in the node's own decade counts it as researched in either mode", () => {
    const own = { startingYear: 2009, mode: "off" as const };
    expect(plant(legacyCorp, own)).toBeGreaterThan(0);
  });

  it("applies to the year window and the display aggregate too", () => {
    expect(getSectorTechEffectsForYear(legacyCorp, type, 2027, OFF_2027).plantOutputBonus).toBe(0);
    expect(getAggregatedTechEffects(legacyCorp, OFF_2027).plantOutputBonus).toBe(0);
    const era = plant(legacyCorp, BASELINE_2027);
    expect(
      getSectorTechEffectsForYear(legacyCorp, type, 2027, BASELINE_2027).plantOutputBonus
    ).toBeCloseTo(era);
    expect(getAggregatedTechEffects(legacyCorp, BASELINE_2027).plantOutputBonus).toBeCloseTo(era);
  });

  it("the breakdown reports researched and baseline separately", () => {
    const b = getSectorTechEffectBreakdown(bothCorp, type, null, BASELINE_2027);
    expect(b.baseline.plantOutputBonus).toBeCloseTo(plant(legacyCorp, BASELINE_2027));
    expect(b.researched.plantOutputBonus).toBeCloseTo(plant(researchedCorp, BASELINE_2027));
    expect(b.total.plantOutputBonus).toBeCloseTo(
      b.baseline.plantOutputBonus + b.researched.plantOutputBonus
    );
    const off = getSectorTechEffectBreakdown(bothCorp, type, null, OFF_2027);
    expect(off.baseline.plantOutputBonus).toBe(0);
    expect(off.total.plantOutputBonus).toBeCloseTo(off.researched.plantOutputBonus);
  });

  it("scales a Corporate-lane pre-start node by the lane scale in baseline mode", () => {
    const generic = find("2009", "generic", "plantOutput");
    expect(generic).toBeDefined();
    const gcorp = { type, unlockedTechNodeIds: generic ? [generic.id] : [] };
    const expected = aggregateTechEffects(
      (generic?.effects ?? []).map((e) => scaleEffect(e, CORP_LANE_EFFECT_SCALE))
    ).plantOutputBonus;
    expect(plant(gcorp, BASELINE_2027)).toBeCloseTo(expected);
    expect(plant(gcorp, OFF_2027)).toBe(0);
  });
});

describe("a corporation founded in the world's start year", () => {
  function expectBelowCaps(label: string, effects: AggregatedTechEffects): void {
    expect(
      effects.plantOutputBonus,
      `${label}: plantOutputBonus reached TECH_PLANT_OUTPUT_CAP`
    ).toBeLessThan(TECH_PLANT_OUTPUT_CAP);
    expect(
      effects.methodOutputBonus,
      `${label}: methodOutputBonus reached TECH_METHOD_OUTPUT_CAP`
    ).toBeLessThan(TECH_METHOD_OUTPUT_CAP);
    expect(
      effects.inputEfficiencyBonus,
      `${label}: inputEfficiencyBonus reached TECH_INPUT_EFFICIENCY_CAP`
    ).toBeLessThan(TECH_INPUT_EFFICIENCY_CAP);
    expect(
      1 - effects.growthCostMultiplier,
      `${label}: growth cost reduction reached TECH_GROWTH_REDUCTION_CAP`
    ).toBeLessThan(TECH_GROWTH_REDUCTION_CAP);
    expect(
      1 - effects.laborCostMultiplier,
      `${label}: labor cost reduction reached TECH_LABOR_REDUCTION_CAP`
    ).toBeLessThan(TECH_LABOR_REDUCTION_CAP);
    for (const shield of ["dominanceShield", "tariffShield", "expansionDiscount"] as const) {
      expect(effects[shield], `${label}: ${shield} reached TECH_SHIELD_CAP`).toBeLessThan(
        TECH_SHIELD_CAP
      );
    }
  }

  /** The researched part has all of its room: nothing counted against any cap. */
  function expectResearchedEmpty(label: string, researched: AggregatedTechEffects): void {
    expect(researched.plantOutputBonus, `${label}: TECH_PLANT_OUTPUT_CAP used by research`).toBe(0);
    expect(researched.methodOutputBonus, `${label}: TECH_METHOD_OUTPUT_CAP used`).toBe(0);
    expect(
      researched.inputEfficiencyBonus,
      `${label}: TECH_INPUT_EFFICIENCY_CAP used by research`
    ).toBe(0);
    expect(
      researched.growthCostMultiplier,
      `${label}: TECH_GROWTH_REDUCTION_CAP used by research`
    ).toBe(1);
    expect(
      researched.laborCostMultiplier,
      `${label}: TECH_LABOR_REDUCTION_CAP used by research`
    ).toBe(1);
    for (const shield of ["dominanceShield", "tariffShield", "expansionDiscount"] as const) {
      expect(researched[shield], `${label}: TECH_SHIELD_CAP used by research (${shield})`).toBe(0);
    }
  }

  for (const preset of SHIPPING_PRESETS) {
    const year = getStartingYearForPreset(preset);
    const off: LegacyTechContext = { startingYear: year, mode: "off" };
    const baseline: LegacyTechContext = { startingYear: year, mode: "baseline" };

    it(`${preset} (${year}): off mode leaves every aggregate below its cap`, () => {
      for (const type of SECTOR_TYPES) {
        const corp = { type, unlockedTechNodeIds: autoGrantedNodeIds(type, year) };
        for (const sectorType of SECTOR_TYPES) {
          expectBelowCaps(
            `${preset}/${type} corp in ${sectorType}`,
            getSectorTechEffects(corp, sectorType, off)
          );
          expectBelowCaps(
            `${preset}/${type} corp in ${sectorType} (year window)`,
            getSectorTechEffectsForYear(corp, sectorType, year, off)
          );
        }
        expectBelowCaps(`${preset}/${type} corp summary`, getAggregatedTechEffects(corp, off));
      }
    });

    it(`${preset} (${year}): baseline mode leaves the researched part at zero and the total as it was`, () => {
      for (const type of SECTOR_TYPES) {
        const corp = { type, unlockedTechNodeIds: autoGrantedNodeIds(type, year) };
        for (const sectorType of SECTOR_TYPES) {
          for (const y of [null, year] as const) {
            const label = `${preset}/${type} corp in ${sectorType}${y == null ? "" : " (year window)"}`;
            const b = getSectorTechEffectBreakdown(corp, sectorType, y, baseline);
            expectResearchedEmpty(label, b.researched);
            // Same numbers as the old single-cap aggregate over the owned nodes.
            const isPrimary = sectorType === type;
            const active = y == null ? null : getActiveTechDecadeIds(y);
            const old = aggregateTechEffects(
              getUnlockedNodes(corp)
                .filter((n) => !active || active.has(n.decadeId))
                .flatMap((n) =>
                  n.lane === "generic"
                    ? n.effects.map((e) => scaleEffect(e, CORP_LANE_EFFECT_SCALE))
                    : isPrimary
                      ? n.effects
                      : []
                )
            );
            expect(b.total, `${label}: era baseline changed from the single-cap numbers`).toEqual(
              old
            );
          }
        }
      }
    });
  }

  it("the guard bites: counting every pre-start node as research in a 2027 world saturates the caps", () => {
    const type: OperatingSectorType = "energy";
    const corp = { type, unlockedTechNodeIds: autoGrantedNodeIds(type, 2027) };
    // A world that began in 1940 treats every one of those nodes as research.
    const old = getSectorTechEffects(corp, type, { startingYear: 1940, mode: "off" });
    expect(old.plantOutputBonus).toBe(TECH_PLANT_OUTPUT_CAP);
    expect(old.inputEfficiencyBonus).toBe(TECH_INPUT_EFFICIENCY_CAP);
  });
});
