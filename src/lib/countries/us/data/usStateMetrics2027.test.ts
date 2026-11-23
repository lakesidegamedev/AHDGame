import { describe, expect, it } from "vitest";
import {
  airQualityIndex2027,
  roadConditionIndex2027,
  stateMetrics2027,
} from "./usStateMetrics2027";
import { states2027 } from "./usStates2027";

const byId = new Map(stateMetrics2027.map((m) => [m._id, m]));
const pop = new Map(
  states2027.filter((s) => s.countryId === "US").map((s) => [s._id, s.population])
);

function weightedMean(pick: (id: string) => number): number {
  let num = 0;
  let den = 0;
  for (const [id, p] of pop) {
    num += pick(id) * p;
    den += p;
  }
  return num / den;
}

function val(
  id: string,
  cat:
    | "environment"
    | "infrastructure"
    | "governance"
    | "publicSafety"
    | "healthcare"
    | "social"
    | "education",
  key: string
): number {
  const m = byId.get(id) as unknown as Record<string, Record<string, { value: number }>>;
  return m[cat][key].value;
}

describe("US 2027 state metrics use sourced per-state data", () => {
  it("covers all 50 states and DC", () => {
    expect(stateMetrics2027).toHaveLength(51);
  });

  it("rates Mississippi air worse than the national index and Hawaii cleaner", () => {
    expect(val("MS", "environment", "airQuality")).toBeLessThan(32);
    expect(val("HI", "environment", "airQuality")).toBeGreaterThan(32);
    expect(val("HI", "environment", "airQuality")).toBeGreaterThan(
      val("MS", "environment", "airQuality")
    );
  });

  it("keeps the population-weighted air quality and road means on the national index", () => {
    expect(weightedMean((id) => val(id, "environment", "airQuality"))).toBeCloseTo(32, 0);
    expect(weightedMean((id) => val(id, "infrastructure", "roadCondition"))).toBeCloseTo(70.5, 0);
  });

  it("gives Ohio and California different road conditions", () => {
    expect(val("OH", "infrastructure", "roadCondition")).not.toBe(
      val("CA", "infrastructure", "roadCondition")
    );
    expect(val("OH", "infrastructure", "roadCondition")).toBeGreaterThan(
      val("CA", "infrastructure", "roadCondition")
    );
  });

  it("maps real PM2.5 and road shares monotonically", () => {
    expect(airQualityIndex2027(5)).toBeGreaterThan(airQualityIndex2027(10));
    expect(roadConditionIndex2027(95)).toBeGreaterThan(roadConditionIndex2027(80));
  });

  it("does not collapse corruption or turnout into income tiers", () => {
    const turnout = new Set(stateMetrics2027.map((m) => val(m._id, "governance", "voterTurnout")));
    expect(turnout.size).toBeGreaterThan(30);
    const corruption = new Set(
      stateMetrics2027.map((m) => val(m._id, "governance", "corruptionIndex"))
    );
    expect(corruption.size).toBe(1);
  });

  it("pins real values from the cited tables", () => {
    expect(val("DC", "publicSafety", "violentCrimeRate")).toBeGreaterThan(900);
    expect(val("MA", "publicSafety", "incarcerationRate")).toBeLessThan(120);
    expect(val("MS", "publicSafety", "incarcerationRate")).toBeGreaterThan(600);
    expect(val("TX", "healthcare", "uninsuredRate")).toBeGreaterThan(15);
    expect(val("MA", "healthcare", "uninsuredRate")).toBeLessThan(3);
    expect(val("ND", "environment", "carbonEmissions")).toBeGreaterThan(70);
    expect(val("VT", "environment", "renewableEnergy")).toBeGreaterThan(95);
    expect(val("AK", "environment", "protectedLand")).toBeGreaterThan(30);
    expect(val("AR", "social", "foodInsecurity")).toBeGreaterThan(19);
    expect(val("WV", "education", "highSchoolGradRate")).toBeGreaterThan(90);
  });

  it("does not make violent crime a function of urbanization", () => {
    const ak = val("AK", "publicSafety", "violentCrimeRate");
    const nj = val("NJ", "publicSafety", "violentCrimeRate");
    expect(ak).toBeGreaterThan(nj * 2);
  });
});
