import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { householdProducerFixture } from "./testing/householdProducerFixture";
import { householdFixture } from "./testing/householdFixture";
import { collectResetMetricOwnerReadings } from "./collectOwnerReadings";
import { refreshResetMetricBoard } from "./rules/refresh";
import { modeledHouseholdFixture } from "./testing/modeledHouseholdFixture";

function setup() {
  const db = createMockDb();
  const fixtures = (["US", "UK", "JP"] as const).map((country) => {
    const f = householdProducerFixture(country),
      boards = householdFixture(country);
    return {
      ...f,
      regions: boards.regions,
      national: {
        ...boards.national,
        householdReference: f.reference,
        householdCurrentState: f.current,
        // A failed producer must not fall back to this older externally prepared source.
        householdSource: boards.source,
      },
    };
  });
  db.collection("resetLawPrograms").find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue(
      fixtures.flatMap((f) =>
        f.programs.map((p) => ({
          ...p,
          _id: `${f.countryId}:cash-law`,
          worldId: f.worldId,
          fundingAccountId: `${f.countryId}:account`,
        }))
      )
    ),
  });
  db.collection("resetDepartmentAccounts").find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue(
      fixtures.map((f) => ({
        _id: `${f.countryId}:account`,
        worldId: f.worldId,
        countryId: f.countryId,
        accruedThroughTurn: f.turn,
        lastProgramDelivery: { L01: { outlaid: 2, implementationFactor: 1 } },
      }))
    ),
  });
  for (const f of fixtures)
    f.current.programRoles = f.current.programRoles.map((r) => ({
      ...r,
      programId: `${f.countryId}:cash-law`,
    }));
  const boards = fixtures.flatMap((f) => [f.national, ...f.regions]);
  db.collection("federalBudget").find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue(
      fixtures.map((f) => ({
        countryId: f.countryId,
        householdResourceControl: f.fiscalControls,
        gdp: 1e9,
        revenue: { total: 1e8 },
        spending: { total: 9e7 },
        debt: { principal: 5e8 },
        economicFactors: { inflationRate: 2 },
      }))
    ),
  });
  db.collection("militaryUnits").find.mockReturnValue({
    toArray: vi
      .fn()
      .mockResolvedValue(
        fixtures.map((f) => ({ countryId: f.countryId, basePower: 100, readiness: 80 }))
      ),
  });
  db.collection("states").find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue(
      fixtures.flatMap((f) =>
        f.regions.map((b) => ({
          _id: b.regionId!,
          countryId: f.countryId,
          population: 4,
          votingEligiblePopulation: 3,
          workingAgePopulation: 3,
        }))
      )
    ),
  });
  return { db, fixtures, boards };
}

describe("current household producer on the turn collector", () => {
  it("builds model frames from current activity and enacted rates, without external current frames or settled controls", async () => {
    const f = setup();
    const modeled = f.fixtures.map((c) => modeledHouseholdFixture(c.reference.countryId));
    for (let i = 0; i < modeled.length; i++) {
      const m = modeled[i]!;
      m.model.programRoles = m.model.programRoles.map((r) => ({
        ...r,
        programId: `${m.countryId}:cash-law`,
      }));
      Object.assign(f.fixtures[i]!.national, {
        householdReference: m.reference,
        householdIncomeModel: m.model,
        householdCurrentState: undefined,
      });
    }
    f.db.collection("gameState").findOne.mockResolvedValue({ preset: "1991-default" });
    f.db.collection("states").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(
        modeled.flatMap((m) =>
          m.activity.map((r) => ({
            _id: r.regionId,
            countryId: m.countryId,
            population: r.population,
            gdp: r.output,
          }))
        )
      ),
    });
    f.db.collection("macroMetrics").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(
        modeled.flatMap((m) =>
          m.activity.map((r) => ({
            _id: r.regionId,
            countryId: m.countryId,
            economic: { costOfLiving: { value: r.costOfLiving } },
          }))
        )
      ),
    });
    f.db.collection("stateBudgets").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(
        modeled.flatMap((m) =>
          m.activity.map((r) => ({
            _id: r.regionId,
            countryId: m.countryId,
            taxRates: r.regionalTaxes,
          }))
        )
      ),
    });
    f.db.collection("federalBudget").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(
        modeled.map((m) => ({
          countryId: m.countryId,
          taxRates: m.nationalTaxes,
          gdp: 1e9,
          revenue: { total: 1e8 },
          spending: { total: 9e7 },
          debt: { principal: 5e8 },
          economicFactors: { inflationRate: 2 },
        }))
      ),
    });
    const result = await collectResetMetricOwnerReadings(f.db as unknown as Db, f.boards, 2, 1991);
    for (const c of f.fixtures) {
      expect(result[c.national._id]!.householdProductionStatus!.path).toBe("produced");
      expect(result[c.regions[0]!._id]!.updates["03"]!.source).toContain("modeled");
    }
    // One model rate batch plus the existing shared law settlement batch, never per household.
    expect(f.db.collection("stateBudgets").find).toHaveBeenCalledTimes(2);
  });
  it("publishes three independently complete countries with one batched law load", async () => {
    const f = setup();
    const results = await collectResetMetricOwnerReadings(f.db as unknown as Db, f.boards, 2, 1991);
    for (const country of f.fixtures) {
      expect(results[country.national._id]!.householdProductionStatus).toEqual({
        evaluatedAtTurn: 2,
        path: "produced",
        gaps: [],
      });
      expect(results[country.regions[0]!._id]!.updates["03"]).toMatchObject({
        definitionVersion: 2,
        value: 0,
        observedAtTurn: 2,
      });
      const advanced = refreshResetMetricBoard({
        board: country.national,
        turn: 2,
        ...results[country.national._id]!,
      }).board;
      expect(advanced.householdProductionStatus!.path).toBe("produced");
      expect(
        refreshResetMetricBoard({ board: advanced, turn: 2, ...results[country.national._id]! })
          .replayed
      ).toBe(true);
      expect(() =>
        refreshResetMetricBoard({
          board: advanced,
          turn: 2,
          ...results[country.national._id]!,
          householdProductionStatus: { evaluatedAtTurn: 2, path: "legacy", gaps: ["changed"] },
        })
      ).toThrow("replay");
    }
    expect(f.db.collection("resetLawPrograms").find).toHaveBeenCalledTimes(1);
  });
  it("keeps an incomplete UK source on legacy without preventing US and Japan publication", async () => {
    const f = setup();
    f.fixtures[1]!.reference.distribution = "marginal-means";
    const results = await collectResetMetricOwnerReadings(f.db as unknown as Db, f.boards, 2, 1991);
    expect(results[f.fixtures[1]!.national._id]!.householdProductionStatus!.path).toBe("legacy");
    expect(
      results[f.fixtures[1]!.regions[0]!._id]!.updates["03"]?.definitionVersion
    ).toBeUndefined();
    for (const country of [f.fixtures[0]!, f.fixtures[2]!])
      expect(results[country.regions[0]!._id]!.updates["03"]!.definitionVersion).toBe(2);
  });
  it("rejects forecast controls and a missing host year without relabeling them current", async () => {
    const f = setup();
    f.fixtures[0]!.fiscalControls.basis = "budget-forecast";
    const results = await collectResetMetricOwnerReadings(f.db as unknown as Db, f.boards, 2, 1991);
    expect(results[f.fixtures[0]!.national._id]!.householdProductionStatus!.gaps).toContain(
      "missing-independent-current-household-controls"
    );
    const unknownYear = await collectResetMetricOwnerReadings(f.db as unknown as Db, f.boards, 2);
    expect(unknownYear[f.fixtures[2]!.national._id]!.householdProductionStatus!.gaps).toContain(
      "missing-current-game-year"
    );
  });
  it("retains an adopted definition and its measurement date when current controls disappear", async () => {
    const f = setup();
    const country = f.fixtures[0]!;
    const first = await collectResetMetricOwnerReadings(f.db as unknown as Db, f.boards, 2, 1991);
    for (const board of country.regions) {
      Object.assign(board, refreshResetMetricBoard({ board, turn: 2, ...first[board._id]! }).board);
    }
    country.fiscalControls.turn = 1;
    const next = await collectResetMetricOwnerReadings(f.db as unknown as Db, f.boards, 3, 1991);
    expect(next[country.national._id]!.householdProductionStatus!.path).toBe("legacy");
    for (const board of country.regions) {
      expect(next[board._id]!.updates["03"]).toMatchObject({
        definitionVersion: 2,
        observedAtTurn: 2,
        value: board.observations["03"]!.value,
      });
    }
  });
});
