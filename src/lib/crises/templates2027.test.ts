import { describe, expect, it } from "vitest";
import type { CrisisEffect, CrisisTemplate } from "@/lib/db/types/crisis";
import { ALL_CRISIS_TEMPLATES } from "./templates";
import { MODERN_2027_CRISIS_TEMPLATES } from "./templates2027";
import { isTemplateAllowedInYear } from "./crisisEraWindow";

const TEMPLATES = Object.entries(MODERN_2027_CRISIS_TEMPLATES);

const BANDS: Array<[string, number, number]> = [
  ["2027 to 2034", 2027, 2034],
  ["2035 to 2042", 2035, 2042],
  ["2043 to 2050", 2043, 2050],
];

const VALID_METRIC_PATHS = new Set([
  "economic.gdpGrowth",
  "economic.unemploymentRate",
  "economic.medianIncome",
  "economic.smallBusinessFormation",
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

describe("2027 to 2050 crisis templates", () => {
  it("registers every template in the catalogue", () => {
    for (const [key, template] of TEMPLATES) {
      expect(ALL_CRISIS_TEMPLATES[key], key).toBe(template);
    }
  });

  it("gives every template an explicit window that sits inside the 2027 to 2050 world", () => {
    for (const [key, t] of TEMPLATES) {
      expect(t.fromYear, key).toBeGreaterThanOrEqual(2027);
      expect(t.untilYear, key).toBeLessThanOrEqual(2050);
      expect(t.fromYear!, key).toBeLessThan(t.untilYear!);
    }
  });

  it.each(BANDS)("has at least six eligible templates in every year of %s", (_label, from, to) => {
    for (let year = from; year <= to; year++) {
      const eligible = TEMPLATES.filter(([, t]) => isTemplateAllowedInYear(t, year));
      expect(eligible.length, `year ${year}`).toBeGreaterThanOrEqual(6);
    }
  });

  it("retires themes that end instead of running to 2050", () => {
    expect(
      isTemplateAllowedInYear(MODERN_2027_CRISIS_TEMPLATES.housing_rate_reset_crash!, 2037)
    ).toBe(false);
    expect(isTemplateAllowedInYear(MODERN_2027_CRISIS_TEMPLATES.chip_fab_fire!, 2041)).toBe(false);
    expect(isTemplateAllowedInYear(MODERN_2027_CRISIS_TEMPLATES.orbital_debris_outage!, 2039)).toBe(
      false
    );
    expect(isTemplateAllowedInYear(MODERN_2027_CRISIS_TEMPLATES.megadrought!, 2030)).toBe(false);
  });

  it("is never scheduled: every template is a low-probability roll with a cooldown", () => {
    for (const [key, t] of TEMPLATES) {
      expect(t.autoTrigger?.kind, key).toBe("random");
      if (t.autoTrigger?.kind !== "random") continue;
      expect(t.autoTrigger.spawnChance, key).toBeGreaterThan(0);
      expect(t.autoTrigger.spawnChance, key).toBeLessThanOrEqual(0.005);
      expect(t.autoTrigger.cooldownTurns, key).toBeGreaterThanOrEqual(144);
    }
  });

  it("keeps the solar storm very rare and global", () => {
    const storm = MODERN_2027_CRISIS_TEMPLATES.severe_solar_storm!;
    expect(storm.scope).toBe("global");
    if (storm.autoTrigger?.kind !== "random") throw new Error("expected a random trigger");
    expect(storm.autoTrigger.spawnChance).toBeLessThan(0.001);
    expect(storm.autoTrigger.cooldownTurns).toBeGreaterThanOrEqual(432);
  });

  it("covers every requested theme", () => {
    const names = TEMPLATES.map(([, t]) => t.name.toLowerCase()).join(" | ");
    for (const theme of [
      "heat",
      "megafire",
      "megadrought",
      "housing",
      "pension",
      "tech lender",
      "chip fab",
      "port",
      "solar storm",
      "ai model",
      "water rationing",
      "grid emergency",
    ]) {
      expect(names, theme).toContain(theme);
    }
  });

  it("follows the choice, funded collective, terminal shape with a real resolution", () => {
    for (const [key, t] of TEMPLATES) {
      const tree = t.interactionDefinition!.decisionTree;
      expect(
        tree.map((n) => n.nodeId),
        key
      ).toEqual(["response", "fund", "terminal"]);
      const [response, fund, terminal] = tree;
      expect(response!.options!.length, key).toBeGreaterThanOrEqual(3);
      for (const option of response!.options!) expect(option.nextNodeId, key).toBe("fund");
      expect(fund!.type, key).toBe("collective");
      expect(fund!.collectiveTarget, key).toBeGreaterThan(0);
      expect(terminal!.outcomeMessage, key).toBeTruthy();
      expect(terminal!.outcomeEffects!.length, key).toBeGreaterThan(0);
      expect(t.interactionDefinition!.autoResolveOnExpiry, key).toBe(true);
    }
  });

  it("only cuts duration on options that are not the do-nothing fallback", () => {
    for (const [key, t] of TEMPLATES) {
      const options = t.interactionDefinition!.decisionTree[0]!.options!;
      expect(
        options.some((o) => (o.durationReductionTurns ?? 0) > 0),
        key
      ).toBe(true);
      expect(options[options.length - 1]!.durationReductionTurns, key).toBeUndefined();
    }
  });

  it("writes only to real metric paths", () => {
    for (const [key, t] of TEMPLATES) {
      for (const e of allEffects(t)) {
        if (e.targetType !== "metric") continue;
        expect(
          VALID_METRIC_PATHS.has(`${e.metricCategory}.${e.metricField}`),
          `${key}: ${e.label}`
        ).toBe(true);
      }
    }
  });

  it("uses unique names and contains no em or en dashes", () => {
    const names = TEMPLATES.map(([, t]) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const [key, t] of TEMPLATES) {
      for (const s of strings(t)) expect(s, key).not.toMatch(DASHES);
    }
  });
});
