import { describe, expect, it } from "vitest";
import { advanceCohort, type CohortInputs } from "./cohortFlows";
import { synthesizeAgeSexVector } from "./seedSynthesis";
import { totalPopulation, dependencyRatio } from "./cohortVector";

/**
 * Population response to an open immigration policy over 240 turns, driven through
 * the cohort engine (`advanceCohort`). Migrants enter at working ages, so a
 * high-migration run should grow the population AND lower the dependency ratio
 * against a low-migration control.
 */
const TPY = 48;
const TURNS = 240;

function seed() {
  return synthesizeAgeSexVector({
    adultShares: { young: 24, mid: 27, mature: 31, senior: 18 },
    medianAge: 38,
    birthRate: 50,
    population: 1_000_000,
  });
}

function run(netInternationalMigrants: number) {
  let v = seed();
  const inputs: CohortInputs = {
    replacementTFR: 2.06,
    birthRateIndex: 50,
    healthcare: { lifeExpectancy: 50, preventableMortality: 50 },
    netInternationalMigrants,
    migrantShareMale: 0.5,
  };
  for (let t = 1; t <= TURNS; t++) v = advanceCohort(v, inputs, t, TPY).vector;
  return { pop: totalPopulation(v), dependency: dependencyRatio(v) };
}

describe("population sim: open immigration, 240 turns", () => {
  // Control: restrictive baseline (~low net migration). Law: Open Borders (high migration).
  const control = run(100);
  const enacted = run(1500);

  it("prints the 240-turn result", () => {
    console.log(
      `\n══ Population: open immigration (240-turn) ══\n` +
        `totalPopulation   control ${control.pop.toFixed(0)} → law ${enacted.pop.toFixed(0)}  (Δ ${(enacted.pop - control.pop).toFixed(0)}) ▲\n` +
        `dependencyRatio   control ${control.dependency.toFixed(4)} → law ${enacted.dependency.toFixed(4)}  (Δ ${(enacted.dependency - control.dependency).toFixed(4)}) ▼`
    );
    expect(true).toBe(true);
  });

  it("Open Borders grows the population vs the restrictive control", () => {
    expect(enacted.pop, `law ${enacted.pop} > control ${control.pop}`).toBeGreaterThan(control.pop);
  });

  it("working-age migration lowers the dependency ratio vs the control", () => {
    expect(
      enacted.dependency,
      `law ${enacted.dependency} < control ${control.dependency}`
    ).toBeLessThan(control.dependency);
  });

  it("the dependency ratio stays in a sane band (no demographic blow-up)", () => {
    expect(enacted.dependency).toBeGreaterThan(0.2);
    expect(enacted.dependency).toBeLessThan(1.2);
    expect(Number.isFinite(enacted.pop)).toBe(true);
    expect(enacted.pop).toBeGreaterThan(0);
  });
});
