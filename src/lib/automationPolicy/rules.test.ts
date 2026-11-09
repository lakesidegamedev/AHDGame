import { describe, expect, it } from "vitest";
import {
  AUTOMATION_METHODS,
  MAX_BUCKET_IMPACT,
  MAX_CREW_RETENTION,
  MAX_LEVY_INPUT_PENALTY,
  NO_AUTOMATION_POLICY,
  applyAutomationLevy,
  automationBucketImpacts,
  automationCrewRetention,
  automationLawSlug,
  automationLevyInputPenalty,
  automationUnionBias,
  mergeBucketImpacts,
  reemploymentSupport,
  retainedLabourFactor,
  subsidisedWageMultiplier,
  wageInsuranceLevelSupport,
  type AutomationPolicy,
} from "./rules";
import { AUTOMATION_LABOUR_FACTORS } from "@/lib/societyPressures/rules/automation";
import { NEUTRAL_TECH_EFFECTS } from "@/lib/constants/techTree/effects";

const policy = (over: Partial<AutomationPolicy>): AutomationPolicy => ({
  ...NO_AUTOMATION_POLICY,
  ...over,
});
const MAXED = policy({
  automationTax: 4,
  wageInsurance: 4,
  retraining: 4,
  hiringSubsidy: 4,
  pensionLevy: 4,
  transitionCompacts: 4,
});

describe("crew retention", () => {
  it("keeps no extra crew with no laws", () => {
    expect(automationCrewRetention(NO_AUTOMATION_POLICY)).toBe(0);
    expect(retainedLabourFactor(0.5, 0)).toBe(0.5);
  });

  it("rises with each law and each rung", () => {
    const tax = [1, 2, 3, 4].map((n) => automationCrewRetention(policy({ automationTax: n })));
    expect(tax.every((v, i) => v > 0 && (i === 0 || v > tax[i - 1]))).toBe(true);
    expect(automationCrewRetention(policy({ hiringSubsidy: 3 }))).toBeGreaterThan(0);
    expect(automationCrewRetention(policy({ transitionCompacts: 3 }))).toBeGreaterThan(0);
    expect(automationCrewRetention(policy({ automationTax: 2, hiringSubsidy: 2 }))).toBeGreaterThan(
      automationCrewRetention(policy({ automationTax: 2 }))
    );
  });

  it("is capped, so no stack of laws stops automation outright", () => {
    expect(automationCrewRetention(MAXED)).toBeLessThanOrEqual(MAX_CREW_RETENTION);
    expect(automationCrewRetention(MAXED)).toBeGreaterThan(0.3);
    // The most automated method still sheds over a quarter of a normal crew.
    expect(
      retainedLabourFactor(AUTOMATION_LABOUR_FACTORS.autonomous_freight, MAX_CREW_RETENTION)
    ).toBeLessThan(0.75);
  });

  it("lifts the factor towards 1 and never past it, and leaves normal plants alone", () => {
    expect(retainedLabourFactor(0.4, 0.25)).toBeCloseTo(0.55);
    expect(retainedLabourFactor(0.4, 1)).toBe(1);
    expect(retainedLabourFactor(1, 0.4)).toBe(1);
    expect(retainedLabourFactor(0.4, Number.NaN)).toBe(0.4);
  });

  it("treats out-of-range or fractional levels as the nearest rung", () => {
    expect(automationCrewRetention(policy({ automationTax: 9 }))).toBe(
      automationCrewRetention(policy({ automationTax: 4 }))
    );
    expect(automationCrewRetention(policy({ automationTax: -2 }))).toBe(0);
    expect(automationCrewRetention(policy({ automationTax: Number.NaN }))).toBe(0);
  });
});

describe("re-employment", () => {
  it("adds speed from retraining and the subsidy, capped at 1", () => {
    expect(reemploymentSupport(NO_AUTOMATION_POLICY)).toBe(0);
    expect(reemploymentSupport(policy({ retraining: 2 }))).toBeGreaterThan(0);
    expect(reemploymentSupport(policy({ retraining: 4 }))).toBeGreaterThan(
      reemploymentSupport(policy({ retraining: 2 }))
    );
    expect(reemploymentSupport(MAXED)).toBeLessThanOrEqual(1);
  });

  it("scores wage insurance by rung", () => {
    expect([0, 1, 2, 3, 4].map(wageInsuranceLevelSupport)).toEqual([0, 0.2, 0.45, 0.75, 1]);
  });
});

describe("corporate costs", () => {
  it("prices levies only on the automation methods", () => {
    for (const method of AUTOMATION_METHODS)
      expect(automationLevyInputPenalty(policy({ automationTax: 2 }), method)).toBeGreaterThan(0);
    expect(automationLevyInputPenalty(MAXED, "standard")).toBe(0);
    expect(automationLevyInputPenalty(MAXED, null)).toBe(0);
    expect(automationLevyInputPenalty(NO_AUTOMATION_POLICY, "autonomous_factory")).toBe(0);
  });

  it("covers every method that sheds crew", () => {
    expect([...AUTOMATION_METHODS].sort()).toEqual(Object.keys(AUTOMATION_LABOUR_FACTORS).sort());
  });

  it("stacks the tax and the pension levy up to a ceiling", () => {
    const both = automationLevyInputPenalty(
      policy({ automationTax: 4, pensionLevy: 4 }),
      "autonomous_factory"
    );
    expect(both).toBeGreaterThan(
      automationLevyInputPenalty(policy({ automationTax: 4 }), "autonomous_factory")
    );
    expect(both).toBeLessThanOrEqual(MAX_LEVY_INPUT_PENALTY);
  });

  it("folds the penalty into every input rate and returns the same object when neutral", () => {
    expect(applyAutomationLevy(NEUTRAL_TECH_EFFECTS, 0, ["oil", "steel"])).toBe(
      NEUTRAL_TECH_EFFECTS
    );
    const out = applyAutomationLevy(NEUTRAL_TECH_EFFECTS, 0.05, ["oil", "steel"]);
    expect(out.inputRateMult.oil).toBeCloseTo(1.05);
    expect(out.inputRateMult.steel).toBeCloseTo(1.05);
    expect(NEUTRAL_TECH_EFFECTS.inputRateMult.oil).toBeUndefined();
  });

  it("cuts the wage bill by at most five percent", () => {
    expect([0, 1, 2, 3, 4].map(subsidisedWageMultiplier)).toEqual([1, 0.995, 0.985, 0.97, 0.95]);
  });
});

describe("unions", () => {
  it("adds union bias only through transition compacts, rising by rung", () => {
    expect(automationUnionBias(MAXED)).toBe(14);
    expect(automationUnionBias(policy({ automationTax: 4, hiringSubsidy: 4 }))).toBe(0);
    expect(
      [0, 1, 2, 3, 4].map((n) => automationUnionBias(policy({ transitionCompacts: n })))
    ).toEqual([0, 2, 5, 9, 14]);
  });
});

describe("voter buckets", () => {
  it("recognises only the automation laws", () => {
    expect(automationLawSlug("us.sec.retrainingGuarantee")).toBe("retrainingGuarantee");
    expect(automationLawSlug("uk.sec.automationTax")).toBe("automationTax");
    expect(automationLawSlug("us.sec.carbonPrice")).toBeNull();
    expect(automationLawSlug("de_automation_tax")).toBeNull();
    expect(automationLawSlug("us.tax.income")).toBeNull();
  });

  it("helps the workers and taxes the owners when a levy rises, and reverses on repeal", () => {
    const up = automationBucketImpacts("us.sec.automationTax", 0, 2);
    expect(up["wealth:low"]).toBeGreaterThan(0);
    expect(up["education:no_college"]).toBeGreaterThan(0);
    expect(up["wealth:high"]).toBeLessThan(0);
    const down = automationBucketImpacts("us.sec.automationTax", 2, 0);
    for (const [bucket, value] of Object.entries(up)) expect(down[bucket]).toBe(-value);
  });

  it("pays pensioners for the pension levy and is silent when the level is unchanged", () => {
    expect(
      automationBucketImpacts("uk.sec.automationPensionLevy", 0, 1)["age:senior"]
    ).toBeGreaterThan(0);
    expect(automationBucketImpacts("uk.sec.automationPensionLevy", 3, 3)).toEqual({});
    expect(automationBucketImpacts("uk.sec.carbonPrice", 0, 4)).toEqual({});
  });

  it("never swings a bucket by more than the cap in one enactment", () => {
    for (const slug of [
      "automationTax",
      "wageInsurance",
      "retrainingGuarantee",
      "hiringSubsidy",
      "automationPensionLevy",
      "transitionCompacts",
    ]) {
      const impacts = automationBucketImpacts(`us.sec.${slug}`, 0, 4);
      expect(Object.keys(impacts).length, slug).toBeGreaterThan(0);
      for (const value of Object.values(impacts))
        expect(Math.abs(value), slug).toBeLessThanOrEqual(MAX_BUCKET_IMPACT);
    }
  });

  it("adds onto the generic impacts and stays inside the generic ten point clamp", () => {
    expect(mergeBucketImpacts({ "wealth:low": 4 }, { "wealth:low": 3, "age:senior": 2 })).toEqual({
      "wealth:low": 7,
      "age:senior": 2,
    });
    expect(mergeBucketImpacts({ "wealth:low": 9 }, { "wealth:low": 6 })["wealth:low"]).toBe(10);
    expect(mergeBucketImpacts({ "wealth:low": 3 }, { "wealth:low": -3 })).toEqual({});
  });
});
