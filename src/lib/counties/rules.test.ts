import { describe, it, expect } from "vitest";
import { apportionPopulation, advanceCountyPopulations } from "./rules";
describe("county population conservation", () => {
  const counties = [
    { id: "01001", population: 7 },
    { id: "01003", population: 3 },
  ];
  it("conserves small totals with deterministic FIPS tie breaks", () => {
    const weights = [
      { id: "2", population: 1 },
      { id: "1", population: 1 },
      { id: "3", population: 1 },
    ];
    expect(apportionPopulation(weights, 2)).toEqual([
      { id: "2", population: 1 },
      { id: "1", population: 1 },
      { id: "3", population: 0 },
    ]);
    expect(
      apportionPopulation([...weights].reverse(), 2).sort((a, b) => a.id.localeCompare(b.id))
    ).toEqual(apportionPopulation(weights, 2).sort((a, b) => a.id.localeCompare(b.id)));
  });
  it("allocates growth and loss proportionally, never reducing a county during net growth", () => {
    expect(advanceCountyPopulations(counties, 20)).toEqual([
      { id: "01001", population: 14 },
      { id: "01003", population: 6 },
    ]);
    expect(advanceCountyPopulations(counties, 5)).toEqual([
      { id: "01001", population: 3 },
      { id: "01003", population: 2 },
    ]);
    expect(advanceCountyPopulations(counties, 0).every((c) => c.population === 0)).toBe(true);
  });
  it("rejects missing weights, duplicates, fractional or negative populations", () => {
    expect(() => apportionPopulation([], 1)).toThrow();
    expect(() =>
      apportionPopulation(
        [
          { id: "a", population: 1 },
          { id: "a", population: 1 },
        ],
        2
      )
    ).toThrow();
    for (const n of [-1, NaN, Infinity, 1.5])
      expect(() => advanceCountyPopulations(counties, n)).toThrow();
  });
  it("preserves exact state and country totals through 480 birth/death/migration turns", () => {
    let states = [
      counties,
      counties.map((c) => ({ ...c, id: c.id + "x", population: c.population * 100 })),
    ];
    for (let turn = 0; turn < 480; turn++) {
      let country = 0;
      states = states.map((rows, i) => {
        const before = rows.reduce((n, c) => n + c.population, 0);
        const births = (turn % 7) + 2,
          deaths = (turn % 3) + 1,
          migration = ((turn + i) % 11) - 5;
        const target = Math.max(0, before + births - deaths + migration);
        country += target;
        const result = advanceCountyPopulations(rows, target);
        expect(result.reduce((n, c) => n + c.population, 0)).toBe(target);
        expect(result.every((c) => Number.isSafeInteger(c.population) && c.population >= 0)).toBe(
          true
        );
        return result;
      });
      expect(states.flat().reduce((n, c) => n + c.population, 0)).toBe(country);
    }
  });
});
