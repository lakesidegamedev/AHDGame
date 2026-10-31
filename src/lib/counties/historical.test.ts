import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { selectStatesBundleForPreset } from "@/lib/admin/seed/seedStates";
import history from "@/lib/countries/us/data/countyPopulationHistory.json";
import { seedCountyPopulations } from "./seed";
import { historicalCountyWeights } from "./historical";
import { countyBaselineYear, selectCountyPopulationBaseline } from "./rules";

const presets = ["1953", "1979", "1991", "1999", "2007", "2019", "2023", "2027"];
describe("preset-specific county population baselines", () => {
  it("selects only completed historical observations and preserves 2019 aliases", () => {
    expect(presets.map((p) => countyBaselineYear(`${p}-default`))).toEqual([
      1950, 1979, 1991, 1999, 2007, 2019, 2023, 2025,
    ]);
    for (const preset of [
      undefined,
      null,
      "empty",
      "2019-no-parties",
      "custom",
      "__proto__",
      "constructor",
      "toString",
    ])
      expect(countyBaselineYear(preset)).toBe(2019);
    expect(historicalCountyWeights("06", 1950).find((c) => c.id === "06037")!.population).toBe(
      4151687
    );
    expect(historicalCountyWeights("06", 1950).find((c) => c.id === "06059")!.population).toBe(
      216224
    );
    expect(historicalCountyWeights("09", 2023)).toEqual([]); // planning regions cannot be mapped to old counties
    expect(historicalCountyWeights("08", 1999)).toEqual([]); // Broomfield did not yet exist
  });
  it.each([
    [1979, 7401000],
    [1991, 8948125],
    [1999, 9437290],
    [2007, 9734701],
    [2023, 9732568],
    [2025, 9694934],
  ] as const)("pins the %s Los Angeles source observation", (year, population) => {
    expect(historicalCountyWeights("06", year).find((c) => c.id === "06037")!.population).toBe(
      population
    );
  });
  it("uses complete historic weights, and proportional fallback for incomplete geography", () => {
    const modern = [
      { id: "a", population: 80 },
      { id: "b", population: 20 },
    ];
    expect(
      selectCountyPopulationBaseline(
        modern,
        [
          { id: "b", population: 90 },
          { id: "a", population: 10 },
        ],
        1950
      )
    ).toEqual({
      weights: [
        { id: "a", population: 10 },
        { id: "b", population: 90 },
      ],
      populationBaseline: "census-1950",
    });
    for (const historical of [
      [],
      [{ id: "a", population: 10 }],
      [
        { id: "a", population: 0 },
        { id: "b", population: 0 },
      ],
      [
        { id: "a", population: 1 },
        { id: "retired", population: 1 },
      ],
    ])
      expect(selectCountyPopulationBaseline(modern, historical, 1950)).toEqual({
        weights: modern,
        populationBaseline: "census-vintage-2019",
      });
    expect(() =>
      selectCountyPopulationBaseline(modern, [{ id: "a", population: NaN }], 1950)
    ).toThrow();
    expect(() =>
      selectCountyPopulationBaseline(
        modern,
        [
          { id: "a", population: 1 },
          { id: "a", population: 2 },
        ],
        1950
      )
    ).toThrow();
  });
  it("records checksummed source provenance and complete fallback decisions", () => {
    const expectedCounts = [2651, 2988, 3049, 3049, 3142, 3134, 3134];
    expect(Object.values(history.snapshots).map((s) => s.historicalCountyCount)).toEqual(
      expectedCounts
    );
    for (const snapshot of Object.values(history.snapshots)) {
      expect(snapshot.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(Object.keys(snapshot.populations)).toHaveLength(snapshot.historicalCountyCount);
      for (const id of Object.keys(snapshot.populations))
        expect(Object.keys(snapshot.fallbackStates)).not.toContain(id.slice(0, 2));
    }
  });
  it.each(presets)(
    "conserves all 3142 counties through a %s reset over stale stocks",
    async (era) => {
      const preset = `${era}-default`,
        db = createInMemoryDb(),
        target = db as unknown as Db;
      db.seed(
        "states",
        selectStatesBundleForPreset(preset).map((state) => ({ ...state }))
      );
      db.seed("gameState", [{ _id: "current", preset }]);
      await seedCountyPopulations(target, { replace: true });
      const initial = structuredClone(db.collection("counties").docs);
      expect(initial).toHaveLength(3142);
      const selectedYear = countyBaselineYear(preset);
      const counts: Readonly<Record<string, { historicalCountyCount: number }>> = history.snapshots;
      if (selectedYear === 2019)
        expect(initial.every((c) => c.populationBaseline === "census-vintage-2019")).toBe(true);
      else
        expect(
          initial.filter((c) => c.populationBaseline === `census-${selectedYear}`)
        ).toHaveLength(counts[selectedYear].historicalCountyCount);
      for (const state of db.collection("states").docs) {
        const rows = initial.filter((c) => c.stateId === state._id);
        expect(rows.reduce((n, c) => n + Number(c.population), 0)).toBe(state.population);
        expect(
          rows.every((c) => Number.isSafeInteger(c.population) && Number(c.population) >= 0)
        ).toBe(true);
      }
      expect(initial.reduce((n, c) => n + Number(c.population), 0)).toBe(
        db.collection("states").docs.reduce((n, s) => n + Number(s.population), 0)
      );
      if (era === "1953")
        expect(initial.find((c) => c._id === "06037")!.populationBaseline).toBe("census-1950");
      for (const row of db.collection("counties").docs) {
        row.population = 999999999;
        row.populationFlowStamp = { worldEpochId: "old", turn: 99, batchId: "old" };
      }
      db.collection("counties").docs.push({
        _id: "retired",
        countryId: "US",
        stateId: "WY",
        population: 1,
      });
      await seedCountyPopulations(target, { replace: true });
      expect(db.collection("counties").docs).toEqual(initial);
    },
    30000
  );
  it("uses the requested bootstrap preset before the saved world clock is stamped", async () => {
    const db = createInMemoryDb();
    db.seed("states", [{ _id: "CA", countryId: "US", population: 1000000 }]);
    db.seed("gameState", [{ _id: "current", preset: "2019-default" }]);
    await seedCountyPopulations(db as unknown as Db, { replace: true, preset: "1953-default" });
    expect(
      db.collection("counties").docs.every((c) => c.populationBaseline === "census-1950")
    ).toBe(true);
  });
  it("preserves existing populations and their original baseline on a non-reset seed", async () => {
    const db = createInMemoryDb(),
      target = db as unknown as Db;
    db.seed("states", [{ _id: "CA", countryId: "US", population: 1000000 }]);
    db.seed("gameState", [{ _id: "current", preset: "2019-default" }]);
    await seedCountyPopulations(target);
    const before = structuredClone(db.collection("counties").docs);
    db.collection("gameState").docs[0].preset = "1953-default";
    await seedCountyPopulations(target);
    expect(db.collection("counties").docs).toEqual(before);
    await seedCountyPopulations(target, { replace: true });
    expect(db.collection("counties").docs.find((c) => c._id === "06037")!.populationBaseline).toBe(
      "census-1950"
    );
    expect(db.collection("counties").docs.map((c) => c.population)).not.toEqual(
      before.map((c) => c.population)
    );
  });
});
