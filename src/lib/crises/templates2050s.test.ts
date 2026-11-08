import { describe, expect, it } from "vitest";
import type { CrisisEffect, CrisisTemplate } from "@/lib/db/types/crisis";
import { ALL_CRISIS_TEMPLATES } from "./templates";
import { MODERN_2050S_CRISIS_TEMPLATES } from "./templates2050s";
import { OPPORTUNITY_2050S_TEMPLATES } from "./opportunities2050s";
import { isTemplateAllowedInYear } from "./crisisEraWindow";

const CRISES = Object.entries(MODERN_2050S_CRISIS_TEMPLATES);
const OFFERS = Object.entries(OPPORTUNITY_2050S_TEMPLATES);

const VALID_METRIC_PATHS = new Set([
  "economic.gdpGrowth",
  "economic.unemploymentRate",
  "economic.medianIncome",
  "economic.consumerConfidence",
  "economic.investorConfidence",
  "economic.tradeBalance",
  "economic.costOfLiving",
  "economic.propertyValueIndex",
  "environment.renewableEnergy",
  "infrastructure.infrastructureInvestmentGap",
  "infrastructure.powerGridReliability",
  "publicSafety.publicSafetyConfidence",
]);

function allEffects(t: CrisisTemplate): CrisisEffect[] {
  const out = [...t.effects];
  for (const node of t.interactionDefinition?.decisionTree ?? []) {
    out.push(...(node.outcomeEffects ?? []));
    for (const o of node.options ?? []) out.push(...o.effects);
  }
  return out;
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

describe("2050s crisis templates and opportunities", () => {
  it("registers everything in the catalogue", () => {
    for (const [key, t] of [...CRISES, ...OFFERS]) expect(ALL_CRISIS_TEMPLATES[key], key).toBe(t);
  });

  it("has at least six crises eligible in every year 2050 to 2059", () => {
    for (let year = 2050; year <= 2059; year++) {
      const eligible = CRISES.filter(([, t]) => isTemplateAllowedInYear(t, year));
      expect(eligible.length, `year ${year}`).toBeGreaterThanOrEqual(6);
    }
  });

  it("retires some themes before the decade ends and closes every window by 2059", () => {
    for (const [key, t] of CRISES) {
      expect(t.fromYear, key).toBeGreaterThanOrEqual(2050);
      expect(t.untilYear, key).toBeLessThanOrEqual(2059);
    }
    expect(isTemplateAllowedInYear(MODERN_2050S_CRISIS_TEMPLATES.aquifer_collapse!, 2058)).toBe(
      false
    );
  });

  it("offers at least two opportunities in every year 2050 to 2059", () => {
    for (let year = 2050; year <= 2059; year++) {
      const eligible = OFFERS.filter(([, t]) => isTemplateAllowedInYear(t, year));
      expect(eligible.length, `year ${year}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("never schedules anything: rolls are rare and conditions are armed by world state", () => {
    for (const [key, t] of [...CRISES, ...OFFERS]) {
      const trig = t.autoTrigger!;
      expect(trig.cooldownTurns, key).toBeGreaterThanOrEqual(144);
      if (trig.kind === "random") expect(trig.spawnChance, key).toBeLessThanOrEqual(0.005);
      else expect(trig.condition.all.length, key).toBeGreaterThan(0);
    }
    expect(CRISES.some(([, t]) => t.autoTrigger?.kind === "condition")).toBe(true);
  });

  it("gives every crisis a response choice, a funded node and a terminal outcome", () => {
    for (const [key, t] of CRISES) {
      const tree = t.interactionDefinition!.decisionTree;
      expect(
        tree.map((n) => n.nodeId),
        key
      ).toEqual(["response", "fund", "terminal"]);
      const options = tree[0]!.options!;
      expect(options.length, key).toBeGreaterThanOrEqual(3);
      expect(
        options.some((o) => (o.durationReductionTurns ?? 0) > 0),
        key
      ).toBe(true);
      expect(options[options.length - 1]!.durationReductionTurns, key).toBeUndefined();
      expect(t.interactionDefinition!.autoResolveOnExpiry, key).toBe(true);
    }
  });

  it("prices every opportunity path and lets a decline cost nothing", () => {
    for (const [key, t] of OFFERS) {
      expect(t.opportunity, key).toBe(true);
      const options = t.interactionDefinition!.decisionTree[0]!.options!;
      const decline = options.find((o) => o.optionId === "decline")!;
      expect(decline.effects, key).toEqual([]);
      for (const o of options.filter((x) => x.optionId !== "decline")) {
        expect(
          o.effects.some((e) => e.value < 0),
          `${key}/${o.optionId}`
        ).toBe(true);
      }
    }
  });

  it("writes only real metric paths", () => {
    for (const [key, t] of [...CRISES, ...OFFERS]) {
      for (const e of allEffects(t)) {
        if (e.targetType === "metric") {
          expect(
            VALID_METRIC_PATHS.has(`${e.metricCategory}.${e.metricField}`),
            `${key}: ${e.label}`
          ).toBe(true);
        }
      }
    }
  });

  it("uses unique names and no en or em dashes", () => {
    const names = [...CRISES, ...OFFERS].map(([, t]) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const [key, t] of [...CRISES, ...OFFERS]) {
      for (const s of strings(t)) expect(s, key).not.toMatch(DASHES);
    }
  });
});
