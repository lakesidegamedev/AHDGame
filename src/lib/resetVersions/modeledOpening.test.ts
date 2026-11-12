import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import {
  getInitialNationalBudgetsForPreset,
  generateDefaultEnactedLaws,
  generateStateBudgets,
} from "@/lib/seeds/reference/budgets";
import { getRegionCensusData } from "@/lib/seeds/regionCensusData";
import { synthesizeAgeSexVector } from "@/lib/demographics/seedSynthesis";
import { RESET_V2_OPENING_COUNTRIES } from "./rules";
import { loadModeledOpening } from "./seedModeledOpening";
import {
  modeledSeedMetrics,
  modeledSeedRegions,
  metricNumbers,
  modeledCensusGaps,
} from "./modeledSeedInputs";
import { buildResetAuthorityClaims } from "@/lib/resetFinance/rules/authorityClaims";

function fixture(preset: string) {
  const db = createMockDb();
  const countries = RESET_V2_OPENING_COUNTRIES.filter(
    (c) => modeledCensusGaps(preset, c).length === 0
  );
  const states = countries.flatMap((c) => modeledSeedRegions(preset, c));
  const metrics = countries.flatMap((c) =>
    modeledSeedMetrics(preset, c).map((r) => ({ ...r, countryId: c }))
  );
  const demographics = states.map((s) => {
    const census = getRegionCensusData(s.countryId, s._id, preset)!;
    const values = metricNumbers(
      metrics.find((m) => m._id === s._id && m.countryId === s.countryId)!
    );
    return {
      _id: s._id,
      countryId: s.countryId,
      ages: synthesizeAgeSexVector({
        adultShares: {
          young: census.age.young ?? 0,
          mid: census.age.mid ?? 0,
          mature: census.age.mature ?? 0,
          senior: census.age.senior ?? 0,
        },
        medianAge: values["population.medianAge"]!,
        birthRate: values["population.birthRate"]!,
        population: s.population,
      }),
    };
  });
  const budgets = getInitialNationalBudgetsForPreset(preset).filter((b) =>
    countries.includes(b.countryId as "US")
  );
  const regional = generateStateBudgets(
    states.map((s) => ({
      id: s._id,
      countryId: s.countryId,
      population: s.population,
      gdp: s.gdp,
    })),
    2027
  );
  const rows: Record<string, unknown[]> = {
    states,
    federalBudget: budgets,
    stateBudgets: regional,
    macroMetrics: metrics,
    regionDemographics: demographics,
    enactedLaws: generateDefaultEnactedLaws(preset),
    militaryUnits: [],
  };
  for (const [name, docs] of Object.entries(rows))
    db.collection(name).find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(docs) });
  return { db: db as unknown as Db, budgets, states };
}

describe("modeled preset v2 openings", () => {
  it("binds an off-anchor opening and its cohort inputs to the requested date", async () => {
    const { db, budgets } = fixture("2027-default");
    const opening = await loadModeledOpening(db, "2027-default", "off-anchor", 12, {
      year: 2027,
      week: 12,
    });
    for (const board of opening.metrics.filter((b) => b.scope === "regional")) {
      expect(board.sourceTurn).toBe(12);
      expect(board.modeledOpening?.year).toBe(2027);
      expect(Number.isFinite(board.modeledOpening?.birthRateIndex)).toBe(true);
      expect(Number.isFinite(board.modeledOpening?.migrationRate)).toBe(true);
      expect(board.modeledOpening?.life?.openingYears).toBe(board.observations["20"]!.value);
    }
    expect(
      opening.metrics.find((b) => b.countryId === "UK")?.modeledOpening?.sourceFiscalYear
    ).toBe(budgets.find((b) => b.countryId === "UK")?.fiscalYear);
  });
  it.each([
    "1953-default",
    "1979-default",
    "1999-default",
    "2007-default",
    "2019-default",
    "2023-default",
    "2027-default",
    "empty",
    "2019-no-parties",
  ])("conserves the %s seed books and builds complete country-scoped boards", async (preset) => {
    const { db, budgets, states } = fixture(preset);
    const opening = await loadModeledOpening(db, preset, "isolated-test", 1);
    expect(opening.metrics.filter((b) => b.scope === "regional")).toHaveLength(states.length);
    expect(opening.fiscal.laws).toHaveLength(states.length + opening.countries.length);
    for (const board of opening.metrics) {
      expect(board.modeledOpening?.preset).toBe(preset);
      expect(Object.values(board.observations).every((o) => Number.isFinite(o.value))).toBe(true);
    }
    for (const budget of budgets) {
      const board = opening.fiscal.departments.find((b) => b.countryId === budget.countryId)!;
      expect(board.operating).toBe(
        Math.round(budget.spending.total - budget.spending.debtInterest)
      );
      const reserve = opening.partition.continuity.find((r) => r.countryId === budget.countryId)!;
      const accounts = opening.partition.accounts.filter((a) => a.countryId === budget.countryId);
      expect(
        accounts.reduce((s, a) => s + a.annualAuthority, 0) +
          reserve.annualAuthority +
          Math.round(budget.spending.stateGrants)
      ).toBe(board.operating);
      expect(() => buildResetAuthorityClaims(accounts, reserve, 2)).not.toThrow();
      const observed = opening.metrics.find(
        (b) => b.countryId === budget.countryId && b.scope === "national"
      )!;
      expect(observed.observations["10"]!.value).toBeCloseTo(
        (budget.debt.principal / budget.gdp) * 100
      );
    }
  });
});
