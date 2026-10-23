import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { housingFixture } from "./testing/housingFixture";
import { collectResetMetricOwnerReadings } from "./collectOwnerReadings";
import { refreshResetMetricBoard } from "./rules/refresh";
import { aggregateNationalMetricValue } from "./rules/nationalAggregation";

describe("housing production owner integration", () => {
  function setup(country: "US" | "UK" | "JP" = "UK") {
    const f = housingFixture(country);
    const db = createMockDb();
    db.collection("macroMetrics").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(
        f.regions.map((b) => ({
          _id: b.regionId,
          countryId: country,
          economic: {
            medianIncome: { value: 30000 },
            costOfLiving: { value: 100 },
            unemploymentRate: { value: 8 },
            povertyRate: { value: 15 },
            gdpGrowth: { value: 2 },
            productivityGrowth: { value: 1 },
          },
          labourEmployment: { lastTurn: 2, laborForce: 200 },
          resetCohortReading: {
            asOfTurn: 2,
            periodLifeExpectancy: 75,
            populationGrowthAnnualized: 1,
            realizedTfr: 2,
            dependencyBurden15To64: 50,
          },
        }))
      ),
    });
    const families = { "cash-law": "L01", "capital-law": "L22", "assistance-law": "L23" };
    db.collection("resetLawPrograms").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(
        Object.entries(families).map(([id, familyId]) => ({
          _id: id,
          worldId: "test-world",
          country,
          scope: "national",
          familyId,
          fundingAccountId: "account",
          effectiveTurn: 1,
          primaryMetricEffects: [],
        }))
      ),
    });
    db.collection("resetDepartmentAccounts").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: "account",
          countryId: country,
          accruedThroughTurn: 2,
          lastProgramDelivery: {
            L01: { outlaid: 2, implementationFactor: 1 },
            L22: { outlaid: 200, implementationFactor: 1 },
            L23: { outlaid: 2, implementationFactor: 1 },
          },
        },
      ]),
    });
    db.collection("states").find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue(
          f.regions.map((b) => ({ _id: b.regionId, countryId: country, population: 400 }))
        ),
    });
    return { ...f, db };
  }
  it.each(["US", "UK", "JP"] as const)(
    "advances funded housing stocks and current outcomes in %s",
    async (country) => {
      const f = setup(country);
      const result = await collectResetMetricOwnerReadings(
        f.db as unknown as Db,
        [f.national, ...f.regions],
        2
      );
      const readings = f.regions.map((board) => {
        const bundle = result[board._id]!;
        expect(bundle.housingState!.usableDwellings).toBe(110);
        expect(bundle.housingState!.unhousedPeople).toBe(0);
        expect(bundle.updates["24"]!.definitionVersion).toBe(2);
        expect(bundle.updates["24"]!.value).toBeCloseTo((100 * 112) / 468);
        expect(bundle.updates["25"]!.value).toBe(480);
        const advanced = refreshResetMetricBoard({ board, turn: 2, ...bundle }).board;
        expect(advanced.housingState!.constructionCash).toBe(0);
        return { regionId: board.regionId!, population: 400, observations: advanced.observations };
      });
      expect(aggregateNationalMetricValue("24", readings)).toBeCloseTo((100 * 112) / 468);
      expect(aggregateNationalMetricValue("25", readings)).toBe(480);
      expect(f.db.collection("resetLawPrograms").find).toHaveBeenCalledTimes(1);
    }
  );
  it("keeps housing on existing calculations when household inputs are incomplete", async () => {
    const f = setup();
    f.source.coverage.references.composition = undefined;
    const result = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    expect(result[f.regions[0]!._id]!.housingState).toBeUndefined();
    expect(result[f.regions[0]!._id]!.updates["24"]!.definitionVersion).toBeUndefined();
  });
  it("does not count the same benefit as both household cash and rent reduction", async () => {
    const f = setup();
    f.housing.programRoles = f.housing.programRoles.map((r) =>
      r.programId === "cash-law" ? { ...r, role: "landlord-assistance", share: 1 } : r
    );
    const result = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    expect(result[f.regions[0]!._id]!.housingState).toBeUndefined();
  });
  it("keeps existing housing if claimed construction money was not paid", async () => {
    const f = setup();
    f.housing.regions[0]!.flow.constructionCashReceived = 9999;
    const result = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    expect(result[f.regions[0]!._id]!.housingState).toBeUndefined();
  });
  it("replays published housing without spending or completing twice", async () => {
    const f = setup();
    const first = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    const advanced = f.regions.map(
      (board) => refreshResetMetricBoard({ board, turn: 2, ...first[board._id]! }).board
    );
    const retry = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...advanced],
      2
    );
    for (const board of advanced) {
      const again = refreshResetMetricBoard({ board, turn: 2, ...retry[board._id]! });
      expect(again.replayed).toBe(true);
      expect(again.board.housingState).toEqual(board.housingState);
    }
  });
  it("recovers a partially persisted country without completing the first region twice", async () => {
    const f = setup();
    const first = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    const committed = refreshResetMetricBoard({
      board: f.regions[0]!,
      turn: 2,
      ...first[f.regions[0]!._id]!,
    }).board;
    const partial = [committed, f.regions[1]!];
    const retry = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...partial],
      2
    );
    const recovered = partial.map(
      (board) => refreshResetMetricBoard({ board, turn: 2, ...retry[board._id]! }).board
    );
    expect(recovered.map((b) => b.housingState!.usableDwellings)).toEqual([110, 110]);
    expect(recovered[0]!.housingState).toEqual(committed.housingState);
    f.housing.regions[0]!.flow.newProjects = [
      { id: "changed-source", dwellings: 10, earliestCompletionTurn: 5 },
    ];
    await expect(
      collectResetMetricOwnerReadings(f.db as unknown as Db, [f.national, ...partial], 2)
    ).rejects.toThrow("changed");
  });
});
