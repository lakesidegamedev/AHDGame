import { afterEach, describe, expect, it } from "vitest";
import {
  isLegislationTypeActive,
  isLegislationTypeFileable,
  isNewThisEra,
} from "@/lib/era/legislationCatalog";
import { getProjectedPoliticalLegislationTypes } from "@/lib/admin/seed/seedPoliticalLegislation";
import { POLITICAL_METRIC_FAMILIES } from "../../politicalMetrics/families";
import { budgetKeyForLaw } from "../budgetKeys";
import { getCatalog, getEraCatalog, getLaw } from "../catalog";
import { lawTargets } from "../dynamics";
import { validateCatalog } from "../validate";
import { projectLawToLegislationType } from "../project";
import type { PoliticalLaw } from "../types";
import { MODERN_ERA_LAW_SPECS, UK_MODERN_ERA_LAWS, US_MODERN_ERA_LAWS } from "./modernEraLaws";
import { UK_LAWS } from "./ukLaws";
import { US_LAWS } from "./usLaws";

const BOOKS = { US: US_MODERN_ERA_LAWS, UK: UK_MODERN_ERA_LAWS } as const;
const CORE = { US: US_LAWS, UK: UK_LAWS } as const;
const SLUGS_2027 = [
  "aiLiabilityTransparency",
  "dataProtectionOverhaul",
  "housingSupplyZoning",
  "criticalMineralsStockpile",
  "cyberResilienceMandate",
  "platformContentLaw",
  "carbonPrice",
  "coalPhaseOut",
  "cleanPowerStandard",
];
const SLUGS_2030 = [
  "automationTax",
  "wageInsurance",
  "carbonBorderAdjustment",
  "heatLabourStandards",
  "pensionAgeIndexation",
  "nuclearLicensingReform",
];
const SLUGS_2035 = [
  "climateAdaptationFund",
  "managedRetreat",
  "basicIncomePilot",
  "geneEditingRegulation",
  "spaceTrafficAct",
];
const SLUGS_2040 = [
  "automationDividend",
  "fourDayWeek",
  "digitalCurrencyLegalTender",
  "sovereignWealthFundMandate",
];
const SLUGS_2045 = ["longevityCare", "fossilFuelSunset", "digitalSelfOwnership", "waterSecurity"];
const SLUGS_2050 = [
  "advancedAiOversight",
  "lifelongPensionAccount",
  "zeroCarbonEconomy",
  "spaceResources",
];
/** Laws that close to new bills, and the year they close. */
const UNTIL_BY_SLUG = new Map<string, number>([
  ["automationTax", 2040],
  ["coalPhaseOut", 2045],
  ["dataProtectionOverhaul", 2045],
  ["basicIncomePilot", 2045],
  ["aiLiabilityTransparency", 2050],
  ["pensionAgeIndexation", 2050],
  ["cleanPowerStandard", 2050],
]);
const FROM_BY_SLUG = new Map<string, number>([
  ...SLUGS_2027.map((slug) => [slug, 2027] as const),
  ...SLUGS_2030.map((slug) => [slug, 2030] as const),
  ...SLUGS_2035.map((slug) => [slug, 2035] as const),
  ...SLUGS_2040.map((slug) => [slug, 2040] as const),
  ...SLUGS_2045.map((slug) => [slug, 2045] as const),
  ...SLUGS_2050.map((slug) => [slug, 2050] as const),
]);
/** Laws that raise revenue, and the first rung that does. */
const REVENUE_FROM_LEVEL = new Map<string, number>([
  ["automationTax", 1],
  ["carbonPrice", 1],
  ["carbonBorderAdjustment", 1],
  ["automationDividend", 1],
  ["sovereignWealthFundMandate", 1],
  ["digitalCurrencyLegalTender", 3],
]);
const slugOf = (law: PoliticalLaw) => law.id.split(".")[2];
const METRIC_IDS = new Set<string>(POLITICAL_METRIC_FAMILIES.map((family) => family.id));

function allCopy(law: PoliticalLaw): string[] {
  return [
    law.title,
    law.description,
    ...(law.levels ?? []).flatMap((level) => [level.name, level.description]),
  ];
}

describe.each(["US", "UK"] as const)("%s later-era laws", (countryId) => {
  const laws = BOOKS[countryId];
  const cc = countryId.toLowerCase();

  it("authors the 2027 to 2050 bands as national secondaries seeded at level 0", () => {
    expect(laws.map((law) => law.id)).toEqual(
      [
        ...SLUGS_2027,
        ...SLUGS_2030,
        ...SLUGS_2035,
        ...SLUGS_2040,
        ...SLUGS_2045,
        ...SLUGS_2050,
      ].map((slug) => `${cc}.sec.${slug}`)
    );
    for (const law of laws) {
      expect(law.countryId).toBe(countryId);
      expect(law.kind).toBe("secondary");
      expect(law.allowedScope).toBe("national");
      expect(law.baselineLevel).toBe(0);
      expect(law.levels).toHaveLength(5);
      const slug = slugOf(law);
      expect(law.window?.until).toBe(UNTIL_BY_SLUG.get(slug));
      expect(law.window?.from).toBe(FROM_BY_SLUG.get(slug));
    }
    expect(getEraCatalog(countryId)).toBe(laws);
  });

  it("joins the law book without colliding with or entering the core catalog", () => {
    const coreIds = new Set(CORE[countryId].map((law) => law.id));
    for (const law of laws) {
      expect(coreIds.has(law.id)).toBe(false);
      expect(getLaw(law.id)).toBe(law);
      expect(getCatalog(countryId).some((entry) => entry.id === law.id)).toBe(true);
    }
  });

  it("names a winner first and a payer, on real metrics", () => {
    for (const law of laws) {
      expect(law.targets[0].weight).toBeGreaterThan(0);
      const winners = law.targets.filter((target) => target.weight > 0);
      const payers = law.targets.filter((target) => target.weight < 0);
      expect(winners.length, law.id).toBeGreaterThanOrEqual(2);
      expect(payers.length, law.id).toBeGreaterThanOrEqual(1);
      for (const target of law.targets) {
        expect(METRIC_IDS.has(target.metricId), `${law.id} ${target.metricId}`).toBe(true);
        expect(Math.abs(target.weight)).toBeGreaterThanOrEqual(0.25);
        expect(Math.abs(target.weight)).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it("prices every rung above zero, rising, and leaves level 0 free", () => {
    for (const law of laws) {
      const [repealed, ...rungs] = law.levels!;
      expect(repealed.gdpCostFraction).toBeUndefined();
      expect(repealed.gdpRevenueFraction).toBeUndefined();
      if (slugOf(law) === "pensionAgeIndexation") continue;
      const costs = rungs.map((level) => level.gdpCostFraction ?? 0);
      expect(
        costs.every((cost) => cost > 0 && cost <= 0.12),
        law.id
      ).toBe(true);
      expect(
        costs.every((cost, i) => i === 0 || cost > costs[i - 1]),
        law.id
      ).toBe(true);
    }
  });

  it("gives the automation tax, carbon price and carbon border adjustment real, rising revenue", () => {
    for (const slug of ["automationTax", "carbonPrice", "carbonBorderAdjustment"]) {
      const law = laws.find((entry) => entry.id === `${cc}.sec.${slug}`)!;
      const revenue = law.levels!.slice(1).map((level) => level.gdpRevenueFraction ?? 0);
      expect(revenue.every((value, i) => value > 0 && (i === 0 || value > revenue[i - 1]))).toBe(
        true
      );
      // Net of administration the levy is a revenue raiser at every rung.
      law.levels!.slice(1).forEach((level) => {
        expect(level.gdpRevenueFraction!).toBeGreaterThan(level.gdpCostFraction ?? 0);
      });
      const doc = projectLawToLegislationType(law);
      expect(doc.policyOptions![4].costModelV2?.gdpRevenueFraction).toBe(revenue[3]);
    }
  });

  it("raises revenue only where the law collects money, rising from its first paying rung", () => {
    for (const law of laws) {
      const firstPaying = REVENUE_FROM_LEVEL.get(slugOf(law));
      const revenue = law.levels!.map((level) => level.gdpRevenueFraction);
      if (firstPaying === undefined) {
        expect(
          revenue.every((value) => value === undefined),
          law.id
        ).toBe(true);
        continue;
      }
      revenue.forEach((value, level) => {
        if (level < firstPaying) expect(value, `${law.id} ${level}`).toBeUndefined();
        else expect(value! > (revenue[level - 1] ?? 0), `${law.id} ${level}`).toBe(true);
      });
    }
  });

  it("pays the automation dividend back out: the payout matches the levy, net of running it", () => {
    const law = laws.find((entry) => entry.id === `${cc}.sec.automationDividend`)!;
    expect(law.budgetKeyOverride).toBe(countryId === "US" ? "socialSecurity" : "welfare");
    for (const level of law.levels!.slice(1)) {
      const net = level.gdpRevenueFraction! - level.gdpCostFraction!;
      expect(net).toBeLessThan(0);
      expect(net).toBeGreaterThan(-0.001);
    }
  });

  it("books a real, growing saving on the pension line for pension age indexation", () => {
    const law = laws.find((entry) => entry.id === `${cc}.sec.pensionAgeIndexation`)!;
    expect(budgetKeyForLaw(law)).toBe(countryId === "US" ? "socialSecurity" : "statePensions");
    const [, review, ...indexed] = law.levels!.map((level) => level.gdpCostFraction ?? 0);
    // The review alone only costs its running; indexation then saves.
    expect(review).toBeGreaterThan(0);
    expect(indexed.every((cost, i) => cost < 0 && (i === 0 || cost < indexed[i - 1]))).toBe(true);
    const doc = projectLawToLegislationType(law);
    expect(doc.policyOptions![4].costModelV2?.gdpCostFraction).toBe(indexed[2]);
    // The book validator accepts the saving (it caps costs from above only).
    const modernIds = laws.map((entry) => entry.id);
    const errors = validateCatalog(getCatalog(countryId), countryId).filter((error) =>
      modernIds.some((id) => error.startsWith(`${id}: level`))
    );
    expect(errors).toEqual([]);
  });

  it("books costs on lines the country already budgets", () => {
    const knownKeys = new Set(
      CORE[countryId].filter((law) => law.kind !== "tax").map((law) => budgetKeyForLaw(law))
    );
    for (const law of laws) {
      expect(knownKeys.has(budgetKeyForLaw(law)), `${law.id} ${budgetKeyForLaw(law)}`).toBe(true);
    }
  });

  it("writes plain player copy: no calendar years, no anchor symbol, no long dashes", () => {
    for (const law of laws) {
      for (const text of allCopy(law)) {
        expect(text, law.id).not.toMatch(/\b(19|20)\d{2}\b/);
        expect(text, law.id).not.toMatch(/[₳–—]/);
        expect(text.trim().length, law.id).toBeGreaterThan(0);
      }
    }
  });

  it("is fileable only from its first year, on the shared filing gate", () => {
    for (const law of laws) {
      const from = law.window!.from;
      expect(isLegislationTypeFileable(law.id, from - 1), law.id).toBe(false);
      expect(isLegislationTypeActive(law.id, from - 1), law.id).toBe(false);
      expect(isLegislationTypeFileable(law.id, from), law.id).toBe(true);
      expect(isLegislationTypeFileable(law.id, 2050), law.id).toBe(law.window!.until === undefined);
      // Era system off: legacy behaviour, nothing gated.
      expect(isLegislationTypeFileable(law.id, null), law.id).toBe(true);
      expect(isNewThisEra(law.id, from)).toBe(true);
      expect(isNewThisEra(law.id, from + 3)).toBe(false);
    }
  });

  it("splits by band in a 2027 world: 2027 laws open, later laws hidden", () => {
    const ids2027 = SLUGS_2027.map((slug) => `${cc}.sec.${slug}`);
    const ids2030 = [...SLUGS_2030, ...SLUGS_2035, ...SLUGS_2040, ...SLUGS_2045, ...SLUGS_2050].map(
      (slug) => `${cc}.sec.${slug}`
    );
    expect(ids2027.every((id) => isLegislationTypeFileable(id, 2027))).toBe(true);
    expect(ids2030.some((id) => isLegislationTypeFileable(id, 2027))).toBe(false);
    for (const id of ids2030) {
      const from = FROM_BY_SLUG.get(id.split(".")[2])!;
      expect(isLegislationTypeFileable(id, from - 1), id).toBe(false);
      expect(isLegislationTypeFileable(id, from), id).toBe(true);
    }
    // The seed baseline only writes records for laws that exist that year.
    const seeded = new Set(getCatalog(countryId, 2027).map((law) => law.id));
    expect(ids2027.every((id) => seeded.has(id))).toBe(true);
    expect(ids2030.some((id) => seeded.has(id))).toBe(false);
  });

  it("moves its winners up and its payer down once enacted", () => {
    for (const law of laws) {
      const points = lawTargets(countryId, new Map([[law.id, 4]]));
      for (const target of law.targets) {
        const value = points[target.metricId];
        if (target.weight > 0) expect(value, `${law.id} ${target.metricId}`).toBeGreaterThan(0);
        else expect(value, `${law.id} ${target.metricId}`).toBeLessThan(0);
      }
    }
  });
});

describe("automation tax retirement", () => {
  it.each(["US", "UK"] as const)(
    "%s: the automation dividend takes over filing in 2040 while an enacted tax stays in force",
    (countryId) => {
      const cc = countryId.toLowerCase();
      const tax = `${cc}.sec.automationTax`;
      const dividend = `${cc}.sec.automationDividend`;
      expect(isLegislationTypeFileable(tax, 2039)).toBe(true);
      expect(isLegislationTypeFileable(tax, 2040)).toBe(false);
      expect(isLegislationTypeFileable(dividend, 2040)).toBe(true);
      expect(isLegislationTypeActive(tax, 2045)).toBe(true);
      expect(getCatalog(countryId, 2045).some((entry) => entry.id === tax)).toBe(true);
      const points = lawTargets(countryId, new Map([[tax, 2]]));
      expect(points["economy.workerSecurity"]).toBeGreaterThan(0);
    }
  );
});

describe("filing window close", () => {
  const law = US_MODERN_ERA_LAWS.find((entry) => entry.id === "us.sec.automationTax")!;
  const original = law.window;

  afterEach(() => {
    law.window = original;
  });

  it("stops new filing at `until` but keeps an enacted law in force with its effects and revenue", () => {
    law.window = { from: 2030, until: 2040 };
    expect(isLegislationTypeFileable(law.id, 2039)).toBe(true);
    expect(isLegislationTypeFileable(law.id, 2040)).toBe(false);
    expect(isLegislationTypeFileable(law.id, 2045)).toBe(false);
    // Budget, spending and revenue paths read existence, which never closes.
    expect(isLegislationTypeActive(law.id, 2045)).toBe(true);
    expect(getCatalog("US", 2045).some((entry) => entry.id === law.id)).toBe(true);
    // The dynamics engine still counts the enacted level.
    const points = lawTargets("US", new Map([[law.id, 3]]));
    expect(points["economy.workerSecurity"]).toBeGreaterThan(0);
    expect(projectLawToLegislationType(law).policyOptions![3].costModelV2).toMatchObject({
      gdpRevenueFraction: 0.0035,
    });
  });
});

describe("seed projection", () => {
  it("writes every later-era type at seed time so it is ready when its year arrives", () => {
    const projected = new Set(getProjectedPoliticalLegislationTypes().map((doc) => doc._id));
    for (const law of [...US_MODERN_ERA_LAWS, ...UK_MODERN_ERA_LAWS]) {
      expect(projected.has(law.id), law.id).toBe(true);
    }
  });

  it("authors each spec once for both countries", () => {
    expect(MODERN_ERA_LAW_SPECS).toHaveLength(32);
    expect(new Set(MODERN_ERA_LAW_SPECS.map((spec) => spec.slug)).size).toBe(32);
  });
});
