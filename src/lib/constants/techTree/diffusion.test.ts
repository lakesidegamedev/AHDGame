import { describe, expect, it } from "vitest";
import {
  adoptionLagYears,
  computeTechReadiness,
  countryDiffusionContext,
  operatorCountriesByStrategy,
  presetUsesTechDiffusion,
  strategyOpenYear,
  type TechDiffusionSnapshot,
} from "./diffusion";
import { getStrategyAvailability } from "./strategyAvailability";
import type { TechCorpView } from "./selectors";

const corp: TechCorpView = { type: "energy", unlockedTechNodeIds: [] };
/** A 2029-tier method with no tech unlock, so only the calendar and diffusion gate it. */
const method = { id: "test_method", minDecade: "2029" };

function snapshot(
  readiness: Record<string, number>,
  operators: Record<string, string[]> = {}
): TechDiffusionSnapshot {
  return {
    readinessByCountry: new Map(Object.entries(readiness)),
    operatorCountriesByStrategy: new Map(
      Object.entries(operators).map(([id, countries]) => [id, new Set(countries)])
    ),
  };
}

describe("technology readiness", () => {
  it("scores a research-heavy, educated, energy-secure, open economy high", () => {
    const readiness = computeTechReadiness({
      rdIntensityPct: 3.4,
      tertiaryAttainmentPct: 50,
      energySupplyRatio: 1.05,
      exportSharePct: 30,
    });
    expect(readiness).toBeGreaterThan(0.7);
    expect(readiness).toBeLessThanOrEqual(1);
  });

  it("scores a low-R&D, low-attainment, energy-short economy low", () => {
    const readiness = computeTechReadiness({
      rdIntensityPct: 0.2,
      tertiaryAttainmentPct: 10,
      energySupplyRatio: 0.6,
      exportSharePct: 8,
    });
    expect(readiness).toBeLessThan(0.4);
    expect(readiness).toBeGreaterThanOrEqual(0);
  });

  it("treats missing inputs as neutral and clamps out-of-range ones", () => {
    expect(computeTechReadiness({})).toBe(0.5);
    expect(
      computeTechReadiness({
        rdIntensityPct: 20,
        tertiaryAttainmentPct: 200,
        energySupplyRatio: 9,
        exportSharePct: 300,
      })
    ).toBe(1);
    expect(
      computeTechReadiness({
        rdIntensityPct: -1,
        tertiaryAttainmentPct: -5,
        energySupplyRatio: 0,
        exportSharePct: -3,
      })
    ).toBe(0);
  });
});

describe("adoption lag", () => {
  it("is 3, 7 or 12 years by readiness band", () => {
    expect(adoptionLagYears(0.9)).toBe(3);
    expect(adoptionLagYears(0.71)).toBe(3);
    expect(adoptionLagYears(0.7)).toBe(7);
    expect(adoptionLagYears(0.4)).toBe(7);
    expect(adoptionLagYears(0.39)).toBe(12);
  });

  it("opens a 2029 method in 2032, 2036 or 2041 by country", () => {
    const at = (readiness: number) =>
      strategyOpenYear(method, { readiness, foreignOperated: false, adopter: "player" });
    expect(at(0.8)).toBe(2032);
    expect(at(0.5)).toBe(2036);
    expect(at(0.2)).toBe(2041);
  });

  it("lets a player license up to 3 years early, never before the tier year", () => {
    expect(
      strategyOpenYear(method, { readiness: 0.5, foreignOperated: true, adopter: "player" })
    ).toBe(2033);
    expect(
      strategyOpenYear(method, { readiness: 0.8, foreignOperated: true, adopter: "player" })
    ).toBe(2029);
  });

  it("does not let an NPP corporation license: it follows the country lag", () => {
    expect(
      strategyOpenYear(method, { readiness: 0.5, foreignOperated: true, adopter: "npp" })
    ).toBe(2036);
  });

  it("does not delay a method with no tier", () => {
    expect(
      strategyOpenYear({}, { readiness: 0.1, foreignOperated: false, adopter: "npp" })
    ).toBeUndefined();
  });
});

describe("country diffusion context", () => {
  it("counts only operators in other countries as foreign", () => {
    const snap = snapshot({ US: 0.8, NG: 0.3 }, { test_method: ["NG"] });
    expect(countryDiffusionContext(snap, "NG", "player", "test_method")?.foreignOperated).toBe(
      false
    );
    expect(countryDiffusionContext(snap, "US", "player", "test_method")?.foreignOperated).toBe(
      true
    );
  });

  it("falls back to middling readiness for an unknown country and is absent without a snapshot", () => {
    expect(countryDiffusionContext(snapshot({}), "FR", "npp", "x")?.readiness).toBe(0.5);
    expect(countryDiffusionContext(undefined, "FR", "npp", "x")).toBeUndefined();
  });

  it("collects operator countries, skipping mothballed and unassigned sectors", () => {
    const operators = operatorCountriesByStrategy([
      { strategyId: "a", countryId: "US" },
      { strategyId: "a", countryId: "DE" },
      { strategyId: "a", countryId: "JP", mothballed: true },
      { strategyId: null, countryId: "UK" },
    ]);
    expect([...(operators.get("a") ?? [])].sort()).toEqual(["DE", "US"]);
    expect(operators.has("null")).toBe(false);
  });

  it("opts in only the 2027 preset", () => {
    expect(presetUsesTechDiffusion("2027-default")).toBe(true);
    expect(presetUsesTechDiffusion("2019-default")).toBe(false);
    expect(presetUsesTechDiffusion(undefined)).toBe(false);
  });
});

describe("getStrategyAvailability with a country context", () => {
  const snap = snapshot({ US: 0.8, BR: 0.5 });

  it("two countries with different readiness adopt the same method years apart", () => {
    const usWorld = { diffusion: { snapshot: snap, countryId: "US", adopter: "player" as const } };
    const brWorld = { diffusion: { snapshot: snap, countryId: "BR", adopter: "player" as const } };
    expect(getStrategyAvailability(corp, method, 2031, true, usWorld)).toEqual({
      locked: true,
      reason: "diffusion",
      opensYear: 2032,
    });
    expect(getStrategyAvailability(corp, method, 2032, true, usWorld).locked).toBe(false);
    expect(getStrategyAvailability(corp, method, 2032, true, brWorld)).toEqual({
      locked: true,
      reason: "diffusion",
      opensYear: 2036,
    });
    expect(getStrategyAvailability(corp, method, 2036, true, brWorld).locked).toBe(false);
  });

  it("reports the era lock before the tier year", () => {
    const world = { diffusion: { snapshot: snap, countryId: "US", adopter: "npp" as const } };
    expect(getStrategyAvailability(corp, method, 2028, true, world).reason).toBe("era");
  });

  it("keeps the calendar-only gate without a country context or with tech trees off", () => {
    expect(getStrategyAvailability(corp, method, 2029, true).locked).toBe(false);
    const world = { diffusion: { snapshot: snap, countryId: "BR", adopter: "npp" as const } };
    expect(getStrategyAvailability(corp, method, 2029, false, world).locked).toBe(false);
  });

  it("opens a licensed method to a player before the NPPs of the same country", () => {
    const licensed = snapshot({ BR: 0.5 }, { test_method: ["US"] });
    const player = {
      diffusion: { snapshot: licensed, countryId: "BR", adopter: "player" as const },
    };
    const npp = { diffusion: { snapshot: licensed, countryId: "BR", adopter: "npp" as const } };
    expect(getStrategyAvailability(corp, method, 2033, true, player).locked).toBe(false);
    expect(getStrategyAvailability(corp, method, 2033, true, npp)).toMatchObject({
      locked: true,
      reason: "diffusion",
      opensYear: 2036,
    });
  });
});
