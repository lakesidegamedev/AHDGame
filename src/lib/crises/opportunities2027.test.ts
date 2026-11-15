import { describe, expect, it } from "vitest";
import type { CrisisEffect, CrisisTemplate } from "@/lib/db/types/crisis";
import { ALL_CRISIS_TEMPLATES } from "./templates";
import { OPPORTUNITY_2027_TEMPLATES } from "./opportunities2027";
import { isTemplateAllowedInYear } from "./crisisEraWindow";
import { crisisSeverity } from "./severity";

const TEMPLATES = Object.entries(OPPORTUNITY_2027_TEMPLATES);

const BANDS: Array<[string, number, number]> = [
  ["2027 to 2030", 2027, 2030],
  ["2031 to 2035", 2031, 2035],
  ["2036 to 2040", 2036, 2040],
  ["2041 to 2045", 2041, 2045],
  ["2046 to 2050", 2046, 2050],
];

const VALID_METRIC_PATHS = new Set([
  "economic.gdpGrowth",
  "economic.unemploymentRate",
  "economic.smallBusinessFormation",
  "economic.consumerConfidence",
  "economic.investorConfidence",
  "economic.tradeBalance",
  "economic.propertyValueIndex",
  "economic.rdIntensity",
  "environment.renewableEnergy",
  "infrastructure.infrastructureInvestmentGap",
  "infrastructure.powerGridReliability",
  "publicSafety.publicSafetyConfidence",
]);

const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

function allEffects(t: CrisisTemplate): CrisisEffect[] {
  const out = [...t.effects];
  for (const node of t.interactionDefinition?.decisionTree ?? []) {
    out.push(...(node.outcomeEffects ?? []));
    for (const o of node.options ?? []) out.push(...o.effects);
  }
  return out;
}

/** Lower is better for these metrics, so a rise is the cost. */
const COST_WHEN_RISING = new Set(["unemploymentRate", "propertyValueIndex"]);

function isCost(e: CrisisEffect): boolean {
  if (e.targetType === "gdpLoss") return true;
  const rising = e.metricField !== null && COST_WHEN_RISING.has(e.metricField);
  return rising ? e.value > 0 : e.value < 0;
}

function responseNode(t: CrisisTemplate) {
  return t.interactionDefinition!.decisionTree.find((n) => n.nodeId === "response")!;
}

describe("2027 world opportunities", () => {
  it("registers every opportunity in the catalogue, flagged as an opportunity", () => {
    for (const [key, template] of TEMPLATES) {
      expect(ALL_CRISIS_TEMPLATES[key], key).toBe(template);
      expect(template.opportunity, key).toBe(true);
      expect(template.autoTrigger?.kind, key).toBe("random");
    }
  });

  it.each(BANDS)("offers at least four opportunities in every year of %s", (_l, from, to) => {
    for (let year = from; year <= to; year++) {
      const eligible = TEMPLATES.filter(([, t]) => isTemplateAllowedInYear(t, year));
      expect(eligible.length, `year ${year}`).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps offering opportunities after 2050", () => {
    const eligible = TEMPLATES.filter(([, t]) => isTemplateAllowedInYear(t, 2055));
    expect(eligible.length).toBeGreaterThanOrEqual(4);
    for (const [key, t] of TEMPLATES) expect(t.fromYear, key).toBeGreaterThanOrEqual(2027);
  });

  it("covers trade, tax, climate, science, sport and culture", () => {
    expect(Object.keys(OPPORTUNITY_2027_TEMPLATES)).toEqual(
      expect.arrayContaining([
        "bilateral_trade_deal_offer",
        "global_minimum_tax_accord",
        "climate_finance_pact_offer",
        "science_megaproject_invitation",
        "olympic_hosting_bid",
        "world_cup_hosting_bid",
        "cultural_breakout_moment",
      ])
    );
    expect(OPPORTUNITY_2027_TEMPLATES.climate_finance_pact_offer!.description).toContain(
      "Climate Adaptation Finance Pact"
    );
    // The pact founds in 2029; its offer cannot come first.
    expect(OPPORTUNITY_2027_TEMPLATES.climate_finance_pact_offer!.fromYear).toBe(2029);
  });

  it("puts a price on every way of taking an offer up", () => {
    for (const [key, t] of TEMPLATES) {
      const takeUp = responseNode(t).options!.filter((o) => o.optionId !== "decline");
      expect(takeUp.length, key).toBe(2);
      for (const option of takeUp) {
        expect(option.effects.some(isCost), `${key}/${option.optionId}`).toBe(true);
        expect(option.nextNodeId, `${key}/${option.optionId}`).toBe("fund");
      }
    }
  });

  it("pays off only on the paths that paid, and lets an unanswered offer lapse for free", () => {
    for (const [key, t] of TEMPLATES) {
      const tree = t.interactionDefinition!.decisionTree;
      const decline = responseNode(t).options!.find((o) => o.optionId === "decline")!;
      expect(decline.effects, key).toEqual([]);
      const declined = tree.find((n) => n.nodeId === decline.nextNodeId)!;
      expect(declined.type, key).toBe("terminal");
      expect(declined.outcomeEffects ?? [], key).toEqual([]);
      const payoff = tree.find((n) => n.nodeId === "terminal")!;
      expect(
        payoff.outcomeEffects!.some((e) => !isCost(e)),
        key
      ).toBe(true);
      expect(responseNode(t).timeLimitMinutes, key).toBeGreaterThan(0);
      expect(t.interactionDefinition!.autoResolveOnExpiry, key).toBe(true);
    }
  });

  it("routes every option to a node that exists", () => {
    for (const [key, t] of TEMPLATES) {
      const tree = t.interactionDefinition!.decisionTree;
      const ids = new Set(tree.map((n) => n.nodeId));
      for (const node of tree) {
        for (const o of node.options ?? [])
          expect(ids.has(o.nextNodeId!), `${key}/${o.optionId}`).toBe(true);
      }
    }
  });

  it("writes only real metric paths", () => {
    for (const [key, t] of TEMPLATES) {
      for (const e of allEffects(t)) {
        if (e.targetType !== "metric") continue;
        expect(VALID_METRIC_PATHS.has(`${e.metricCategory}.${e.metricField}`), `${key}`).toBe(true);
      }
    }
  });

  it("starts with no effect of its own, so it reads as low severity", () => {
    for (const [key, t] of TEMPLATES) {
      expect(t.effects, key).toEqual([]);
      expect(crisisSeverity(t), key).toBe("low");
    }
  });

  it("is a rare roll with a long cooldown, never a schedule", () => {
    for (const [key, t] of TEMPLATES) {
      const trig = t.autoTrigger!;
      if (trig.kind !== "random") throw new Error(key);
      expect(trig.scope, key).toBe("country");
      expect(trig.spawnChance, key).toBeLessThanOrEqual(0.005);
      expect(trig.cooldownTurns, key).toBeGreaterThanOrEqual(192);
    }
  });

  it("uses no en or em dashes in any copy", () => {
    for (const [key, t] of TEMPLATES) {
      for (const s of strings(t)) expect(DASHES.test(s), `${key}: ${s}`).toBe(false);
    }
  });
});
