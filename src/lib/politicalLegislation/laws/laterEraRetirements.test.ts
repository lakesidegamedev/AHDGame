import { describe, expect, it } from "vitest";
import { isLegislationTypeFileable, LEGISLATION_ERA_UNTIL } from "@/lib/era/legislationCatalog";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import {
  MODERN_ERA_LAWS,
  MODERN_ERA_LEGISLATURE_SPECS,
} from "@/lib/seeds/shared/modernEraLegislation";
import { getCatalog } from "../catalog";
import { MODERN_ERA_LAW_SPECS } from "./modernEraLaws";

const YEARS = Array.from({ length: 2059 - 2027 + 1 }, (_, i) => 2027 + i);
const PROGRAM_COUNTRIES = ["US", "UK", "RU", "DD"] as const;

describe("later-era law retirements, program book", () => {
  const bySlug = new Map(MODERN_ERA_LAW_SPECS.map((spec) => [spec.slug, spec]));
  const retired = MODERN_ERA_LAW_SPECS.filter((spec) => spec.until !== undefined);

  it("retires seven laws, each with a successor", () => {
    expect(retired.map((spec) => spec.slug).sort()).toEqual(
      [
        "aiLiabilityTransparency",
        "automationTax",
        "basicIncomePilot",
        "cleanPowerStandard",
        "coalPhaseOut",
        "dataProtectionOverhaul",
        "pensionAgeIndexation",
      ].sort()
    );
    for (const spec of retired) expect(spec.successor, spec.slug).toBeDefined();
  });

  it("names a successor that exists, is open when the law closes, and is not itself retired", () => {
    for (const spec of retired) {
      const successor = bySlug.get(spec.successor!);
      expect(successor, `${spec.slug} -> ${spec.successor}`).toBeDefined();
      expect(spec.until!, spec.slug).toBeGreaterThan(spec.from);
      expect(successor!.from, spec.slug).toBeLessThanOrEqual(spec.until!);
      expect(successor!.until === undefined || successor!.until > spec.until!, spec.slug).toBe(
        true
      );
    }
  });

  it("closes new filing but keeps an enacted law in the catalog for every country that has it", () => {
    for (const country of ["US", "UK"] as const) {
      for (const spec of retired) {
        const id = `${country.toLowerCase()}.sec.${spec.slug}`;
        expect(isLegislationTypeFileable(id, spec.until! - 1), id).toBe(true);
        expect(isLegislationTypeFileable(id, spec.until!), id).toBe(false);
        expect(
          getCatalog(country, 2059).some((law) => law.id === id),
          id
        ).toBe(true);
      }
    }
  });

  it("prices every level with finite numbers", () => {
    for (const country of PROGRAM_COUNTRIES) {
      for (const law of getCatalog(country).filter((entry) => entry.window)) {
        for (const level of law.levels ?? []) {
          expect(Number.isFinite(level.gdpCostFraction ?? 0), law.id).toBe(true);
          expect(Number.isFinite(level.gdpRevenueFraction ?? 0), law.id).toBe(true);
        }
      }
    }
  });
});

describe("later-era law retirements, legacy book", () => {
  const bySlug = new Map(MODERN_ERA_LAWS.map((law) => [law.slug, law]));
  const retired = MODERN_ERA_LAWS.filter((law) => law.until !== undefined);

  it("retires the same seven laws as the program book, each with a successor", () => {
    expect(retired).toHaveLength(7);
    for (const law of retired) expect(law.successor, law.slug).toBeDefined();
  });

  it("names a successor that exists, is open when the law closes, and is not itself retired", () => {
    for (const law of retired) {
      const successor = bySlug.get(law.successor!);
      expect(successor, `${law.slug} -> ${law.successor}`).toBeDefined();
      expect(successor!.from, law.slug).toBeLessThanOrEqual(law.until!);
      expect(successor!.until === undefined || successor!.until > law.until!, law.slug).toBe(true);
    }
  });

  it("registers every retirement for every covered legislature", () => {
    for (const spec of MODERN_ERA_LEGISLATURE_SPECS) {
      for (const law of retired) {
        expect(LEGISLATION_ERA_UNTIL[`${spec.prefix}_${law.slug}`], law.slug).toBe(law.until);
      }
    }
  });

  it("prices every option with a finite, non-negative cost", () => {
    for (const type of legislationTypes.filter((t) => t._id.match(/^(de|jp|cn|ie)_/))) {
      for (const option of type.policyOptions ?? []) {
        const cost = option.gdpCostFraction ?? 0;
        if (!MODERN_ERA_LAWS.some((law) => type._id.endsWith(law.slug))) continue;
        expect(Number.isFinite(cost) && cost >= 0, `${type._id} ${option.id}`).toBe(true);
      }
    }
  });
});

describe("every band year has laws to propose", () => {
  it.each(PROGRAM_COUNTRIES)(
    "%s has a proposable program law in every year 2027 to 2059",
    (country) => {
      for (const year of YEARS) {
        const open = getCatalog(country, year).filter((law) =>
          isLegislationTypeFileable(law.id, year)
        );
        expect(open.length, `${country} ${year}`).toBeGreaterThan(0);
      }
    }
  );

  it.each(["US", "UK"] as const)(
    "%s keeps a later-era law open in every year 2027 to 2059",
    (country) => {
      for (const year of YEARS) {
        const open = getCatalog(country, year).filter(
          (law) => law.window && isLegislationTypeFileable(law.id, year)
        );
        expect(open.length, `${country} ${year}`).toBeGreaterThan(0);
      }
    }
  );

  it.each(PROGRAM_COUNTRIES)("%s opens four new laws in 2045 and four in 2050", (country) => {
    for (const from of [2045, 2050]) {
      const opened = getCatalog(country, from).filter((law) => law.window?.from === from);
      expect(opened, `${country} ${from}`).toHaveLength(4);
      for (const law of opened) {
        expect(isLegislationTypeFileable(law.id, from - 1), law.id).toBe(false);
        expect(isLegislationTypeFileable(law.id, from), law.id).toBe(true);
        expect(isLegislationTypeFileable(law.id, 2059), law.id).toBe(true);
      }
    }
  });

  it.each(MODERN_ERA_LEGISLATURE_SPECS.map((spec) => spec.prefix))(
    "%s has a proposable later-era law in every year 2027 to 2059",
    (prefix) => {
      const ids = MODERN_ERA_LAWS.map((law) => `${prefix}_${law.slug}`);
      for (const year of YEARS) {
        expect(
          ids.some((id) => isLegislationTypeFileable(id, year)),
          `${prefix} ${year}`
        ).toBe(true);
      }
    }
  );

  it.each(MODERN_ERA_LEGISLATURE_SPECS.map((spec) => spec.prefix))(
    "%s opens four new laws in 2045 and four in 2050",
    (prefix) => {
      for (const from of [2045, 2050]) {
        const opened = MODERN_ERA_LAWS.filter((law) => law.from === from);
        expect(opened).toHaveLength(4);
        for (const law of opened) {
          const id = `${prefix}_${law.slug}`;
          expect(isLegislationTypeFileable(id, from - 1), id).toBe(false);
          expect(isLegislationTypeFileable(id, from), id).toBe(true);
        }
      }
    }
  );
});
