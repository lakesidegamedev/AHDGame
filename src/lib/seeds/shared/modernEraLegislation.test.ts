import { describe, expect, it } from "vitest";
import { calculatePolicyOptionAnnualCost } from "@/lib/budget/costs";
import {
  isLegislationTypeActive,
  isLegislationTypeFileable,
  isNewThisEra,
  LEGISLATION_ERA,
  LEGISLATION_ERA_UNTIL,
} from "@/lib/era/legislationCatalog";
import { countDomainTypes, getCostClass } from "@/lib/era/legislationCostCatalog";
import { isMonotoneLadder } from "@/lib/legislature/optionIntensity";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { tierFor } from "@/lib/world/eraRoster";
import type { CountryId } from "@/lib/constants/countries";
import {
  MODERN_ERA_LAWS,
  MODERN_ERA_LEGISLATURE_SPECS,
  MODERN_ERA_TYPE_IDS,
  modernEraLegislationTypes,
} from "./modernEraLegislation";

const seedById = new Map(legislationTypes.map((t) => [t._id, t]));
const lawBySlug = new Map(MODERN_ERA_LAWS.map((law) => [law.slug, law]));
const slugOf = (id: string) => id.slice(id.indexOf("_") + 1);
const CENTRE = 3;

const BAND_2027 = [
  "ai_liability_act",
  "data_protection_overhaul",
  "housing_supply_reform",
  "critical_minerals_stockpile",
  "cyber_resilience_mandate",
  "platform_content_law",
  "carbon_price",
  "coal_phase_out",
  "clean_power_standard",
];
const BAND_2030 = [
  "automation_tax",
  "wage_insurance",
  "carbon_border_adjustment",
  "heat_labour_standards",
  "pension_age_indexation",
  "nuclear_licensing_reform",
];
const BAND_2035 = [
  "climate_adaptation_fund",
  "managed_retreat",
  "basic_income_pilot",
  "gene_editing_regulation",
  "space_traffic_act",
];
const BAND_2040 = [
  "automation_dividend",
  "four_day_week",
  "digital_currency_legal_tender",
  "sovereign_wealth_fund_mandate",
];

const BAND_2045 = [
  "longevity_care_act",
  "fossil_fuel_sunset",
  "digital_self_ownership",
  "water_security_act",
];
const BAND_2050 = [
  "advanced_ai_oversight",
  "lifelong_pension_account",
  "zero_carbon_economy",
  "space_resources_act",
];

describe("2027 to 2050 law types", () => {
  it("authors exactly the four bands, for every covered legislature", () => {
    expect(MODERN_ERA_LAWS.filter((l) => l.from === 2027).map((l) => l.slug)).toEqual(BAND_2027);
    expect(MODERN_ERA_LAWS.filter((l) => l.from === 2030).map((l) => l.slug)).toEqual(BAND_2030);
    expect(MODERN_ERA_LAWS.filter((l) => l.from === 2035).map((l) => l.slug)).toEqual(BAND_2035);
    expect(MODERN_ERA_LAWS.filter((l) => l.from === 2040).map((l) => l.slug)).toEqual(BAND_2040);
    expect(MODERN_ERA_LAWS.filter((l) => l.from === 2045).map((l) => l.slug)).toEqual(BAND_2045);
    expect(MODERN_ERA_LAWS.filter((l) => l.from === 2050).map((l) => l.slug)).toEqual(BAND_2050);
    expect(MODERN_ERA_TYPE_IDS).toHaveLength(
      MODERN_ERA_LAWS.length * MODERN_ERA_LEGISLATURE_SPECS.length
    );
  });

  it("every type ships in the seed catalog", () => {
    for (const id of MODERN_ERA_TYPE_IDS) {
      const seeded = seedById.get(id);
      expect(seeded, id).toBeDefined();
    }
  });

  it("covers the legacy-catalog countries the 2027 world simulates in full", () => {
    const covered = new Set(MODERN_ERA_LEGISLATURE_SPECS.map((s) => s.scope.toUpperCase()));
    expect(covered.has("IE")).toBe(true);
  });

  it("leaves the countries on the one law book to the book", () => {
    const covered = new Set(MODERN_ERA_LEGISLATURE_SPECS.map((s) => s.scope.toUpperCase()));
    for (const country of ["US", "UK", "DE", "JP", "CN"]) expect(covered.has(country)).toBe(false);
  });

  it("each type appears only from its first year", () => {
    for (const id of MODERN_ERA_TYPE_IDS) {
      const from = lawBySlug.get(slugOf(id))!.from;
      expect(LEGISLATION_ERA[id], id).toBe(from);
      expect(isLegislationTypeActive(id, from - 1), id).toBe(false);
      expect(isLegislationTypeFileable(id, from - 1), id).toBe(false);
      expect(isLegislationTypeActive(id, from), id).toBe(true);
      expect(isNewThisEra(id, from), id).toBe(true);
      // Absent from every earlier world.
      expect(isLegislationTypeActive(id, 2019), id).toBe(false);
    }
  });

  it("is fileable in a 2027 world: the 2027 band at once, each later band when its year arrives", () => {
    for (const id of MODERN_ERA_TYPE_IDS) {
      const { from, until } = lawBySlug.get(slugOf(id))!;
      expect(isLegislationTypeFileable(id, 2027), id).toBe(from === 2027);
      for (const year of [2030, 2035, 2040, 2045, 2050, 2059]) {
        const open = year >= from && (until === undefined || year < until);
        expect(isLegislationTypeFileable(id, year), `${id} @ ${year}`).toBe(open);
      }
    }
  });

  it("retires the automation tax when its successor opens", () => {
    for (const spec of MODERN_ERA_LEGISLATURE_SPECS) {
      const tax = `${spec.prefix}_automation_tax`;
      const dividend = `${spec.prefix}_automation_dividend`;
      expect(LEGISLATION_ERA_UNTIL[tax], tax).toBe(2040);
      expect(isLegislationTypeFileable(tax, 2039), tax).toBe(true);
      expect(isLegislationTypeFileable(tax, 2040), tax).toBe(false);
      expect(isLegislationTypeFileable(dividend, 2040), dividend).toBe(true);
      // Retired from filing, not from force: budgets, effects and seeds still see it.
      expect(isLegislationTypeActive(tax, 2045), tax).toBe(true);
    }
  });

  it("is eligible for NPP sponsorship: national, with a seven-option ladder", () => {
    for (const t of modernEraLegislationTypes) {
      expect(t.allowedScope, t._id).toBe("national");
      expect(t.positions.length, t._id).toBeGreaterThan(0);
      expect(t.policyOptions, t._id).toHaveLength(7);
      expect(isMonotoneLadder(t.policyOptions!), t._id).toBe(true);
    }
  });

  it("seeds as no statute: index 3 is the zero-cost, zero-effect centre", () => {
    for (const t of modernEraLegislationTypes) {
      const centre = t.policyOptions![CENTRE];
      expect(centre.stance, t._id).toBe("center");
      expect(centre.effectDirection, t._id).toBe(0);
      expect(centre.economic, t._id).toBe(0);
      expect(centre.gdpCostFraction ?? 0, t._id).toBe(0);
    }
  });

  it("every law has at least one metric effect and someone who pays", () => {
    for (const t of modernEraLegislationTypes) {
      const effects = t.effectTargetsWeighted ?? [];
      expect(effects.length, t._id).toBeGreaterThan(0);
      // Both a winner and a loser: a reform with no downside is not a choice.
      expect(
        effects.some((e) => e.weight > 0),
        t._id
      ).toBe(true);
      expect(
        effects.some((e) => e.weight < 0),
        t._id
      ).toBe(true);
    }
  });

  it("priced laws book a real cost to a budget line; levies carry none", () => {
    for (const t of modernEraLegislationTypes) {
      const law = lawBySlug.get(slugOf(t._id))!;
      if (law.budgetLine) {
        expect(getCostClass(t._id), t._id).toBe("gdpFraction");
        expect(t.budgetCategory, t._id).toBeTruthy();
        const maxOption = t.policyOptions!.reduce((a, b) =>
          (b.gdpCostFraction ?? 0) > (a.gdpCostFraction ?? 0) ? b : a
        );
        const cost = calculatePolicyOptionAnnualCost(
          maxOption,
          {
            budgetCapacity: 0,
            gdp: 1_000_000,
            population: 1_000,
            countryId: t.countryScope!.toUpperCase(),
            year: 2031,
          },
          t._id
        );
        expect(cost, t._id).toBeGreaterThan(0);
        expect(cost!, t._id).toBeLessThanOrEqual(1_000_000 * 0.005);
      } else {
        expect(getCostClass(t._id), t._id).toBe("none");
        expect(t.budgetCategory, t._id).toBeUndefined();
        for (const o of t.policyOptions!) expect(o.gdpCostFraction, t._id).toBeUndefined();
      }
    }
  });

  it("does not reprice existing laws by joining their domain divisor", () => {
    const modern = new Set(MODERN_ERA_TYPE_IDS);
    const before = countDomainTypes(legislationTypes.filter((t) => !modern.has(t._id)));
    expect(countDomainTypes(legislationTypes)).toEqual(before);
  });

  it("keeps cost fractions as authored after the seed materializer runs", () => {
    for (const t of modernEraLegislationTypes) {
      const law = lawBySlug.get(slugOf(t._id))!;
      const seeded = seedById.get(t._id)!;
      const fractions = seeded.policyOptions!.map((o) => o.gdpCostFraction);
      expect(fractions, t._id).toEqual(
        law.budgetLine ? [...(law.gdpCostFractions ?? [])] : Array(7).fill(undefined)
      );
    }
  });

  it("player copy has no em or en dashes", () => {
    for (const t of modernEraLegislationTypes) {
      const copy = [
        t.name,
        t.description,
        t.explanation,
        t.subCategory,
        ...t.positions.map((p) => p.name),
        ...t.policyOptions!.flatMap((o) => [o.name, o.explanation ?? ""]),
      ].join("\n");
      expect(/[\u2013\u2014]/.test(copy), t._id).toBe(false);
    }
  });
});
