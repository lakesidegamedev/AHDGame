import { describe, it, expect, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { loadMetricLawDelivery } from "./loadLawDelivery";
import { loadResetPolicyPressure } from "./loadPolicyPressure";
import { deliveredMetricEffects, metricLawOutlaysAtTurn } from "./rules/lawDelivery";
import { buildOpeningMetricSnapshots1991 } from "./seedOpening1991";
import { openingLawReferences } from "@/lib/resetLegislation/openingLaw";

describe("shared existing-law funding loader", () => {
  it("chooses an unambiguous current opening-law receipt, not a stale first match", async () => {
    const db = createMockDb();
    const reference = openingLawReferences.find(
      (r) => r.country === "UK" && r.scope === "regional" && r.sourceComponents.length > 0
    )!;
    const source = reference.sourceComponents[0]!;
    db.collection("resetLawOpeningBoards").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          countryId: "UK",
          scope: "regional",
          regionId: "region",
          sourceTurn: 1,
          references: { [reference.familyId]: { ...reference, sourceComponents: [source] } },
        },
      ]),
    });
    const receipt = {
      legislationTypeId: source.sourceId,
      implementationFactor: 0.5,
      lastSettledTurn: 10,
      fundedAmount: 30,
    };
    const run = async (programSettlements: Record<string, unknown>) => {
      db.collection("regionalBudgets").find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: "region",
            countryId: "UK",
            programSettlements,
          },
        ]),
      });
      return loadMetricLawDelivery(db as unknown as Db, {
        worldId: "world",
        turn: 10,
        regions: [{ _id: "region", countryId: "UK" }],
      });
    };
    const result = await run({ stale: { ...receipt, lastSettledTurn: 9 }, current: receipt });
    expect(result.programs).toHaveLength(1);
    expect(metricLawOutlaysAtTurn(result.programs, result.settlements, 10)).toEqual([]);
    expect([...result.settlements.values()][0]!.fundedAnnualAmount).toBe(30);
    const ambiguous = await run({ first: receipt, second: receipt });
    expect(ambiguous.settlements.size).toBe(0);
  });

  it("does not manufacture cash outlays from externally settled capability", async () => {
    const db = createMockDb();
    db.collection("resetLawPrograms").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: "defense",
          country: "UK",
          scope: "national",
          familyId: "L48",
          fundingAccountId: "account",
          effectiveTurn: 2,
          primaryMetricEffects: [],
        },
      ]),
    });
    db.collection("resetDepartmentAccounts").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: "account",
          countryId: "UK",
          accruedThroughTurn: 10,
          externallySettled: true,
        },
      ]),
    });
    const result = await loadMetricLawDelivery(db as unknown as Db, {
      worldId: "world",
      turn: 10,
      countryIds: ["UK"],
      regions: [],
    });
    expect(result.settlements.get("defense")!.implementationFactor).toBe(1);
    expect(metricLawOutlaysAtTurn(result.programs, result.settlements, 10)).toEqual([]);
  });
  it.each(["US", "UK", "JP", "IE", "SCO", "WAL"])(
    "distinguishes national turn outlays and regional annual funding for %s without additional reads",
    async (country) => {
      const db = createMockDb();
      const national = {
        _id: "national",
        country,
        scope: "national",
        familyId: "L02",
        fundingAccountId: "account",
        effectiveTurn: 2,
        primaryMetricEffects: [],
      };
      const regional = { ...national, _id: "regional", scope: "regional", regionId: "region" };
      db.collection("resetLawPrograms").find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([national, regional]),
      });
      db.collection("resetDepartmentAccounts").find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: "account",
            countryId: country,
            accruedThroughTurn: 10,
            familyAnnualDemand: { L02: 1000000 },
            lastProgramDelivery: {
              L02: { requested: 100, outlaid: 40, implementationFactor: 0.4 },
            },
          },
        ]),
      });
      const collection = country === "US" ? "stateBudgets" : "regionalBudgets";
      const field = country === "US" ? "regionalProgramSettlements" : "programSettlements";
      db.collection(collection).find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: "region",
            countryId: country,
            [field]: {
              regional: { implementationFactor: 0, lastSettledTurn: 10, fundedAmount: 15 },
            },
          },
        ]),
      });
      const result = await loadMetricLawDelivery(db as unknown as Db, {
        worldId: "world",
        turn: 10,
        regions: [{ _id: "region", countryId: country }],
      });
      expect(
        metricLawOutlaysAtTurn(result.programs, result.settlements, 10).map((p) => p.amount)
      ).toEqual([40]);
      expect(result.settlements.get("regional")!.fundedAnnualAmount).toBe(15);
      expect(result.settlements.get("regional")!.outlaid).toBeUndefined();
      for (const name of [
        "resetLawPrograms",
        "resetDepartmentAccounts",
        "resetLawOpeningBoards",
        collection,
      ])
        expect(db.collection(name).find).toHaveBeenCalledTimes(1);
    }
  );
  it.each(["US", "UK", "JP", "IE", "SCO", "WAL"])(
    "fails closed on missing, stale and cross-country settlement for %s",
    async (country) => {
      const db = createMockDb();
      const program = {
        _id: "law",
        country,
        scope: "regional",
        regionId: "region",
        familyId: "L25",
        fundingAccountId: "regional_budget",
        effectiveTurn: 2,
        primaryMetricEffects: [{ metricId: "26", favorableNormalizedPoints: 0.8 }],
      };
      db.collection("resetLawPrograms").find.mockReturnValue({
        toArray: vi
          .fn()
          .mockResolvedValue([program, { ...program, _id: "future", effectiveTurn: 20 }]),
      });
      const budgetName = country === "US" ? "stateBudgets" : "regionalBudgets";
      const field = country === "US" ? "regionalProgramSettlements" : "programSettlements";
      const input = {
        worldId: "world",
        turn: 10,
        regions: [{ _id: "region", countryId: country }],
      };
      const run = async (data: unknown[]) => {
        db.collection(budgetName).find.mockReturnValue({
          toArray: vi.fn().mockResolvedValue(data),
        });
        const dataSet = await loadMetricLawDelivery(db as unknown as Db, input);
        return deliveredMetricEffects(dataSet.programs, dataSet.settlements, 10)["26"] ?? 0;
      };
      expect(await run([])).toBe(0);
      expect(
        await run([
          {
            _id: "region",
            countryId: country,
            [field]: { law: { implementationFactor: 1, lastSettledTurn: 9, validThroughTurn: 9 } },
          },
        ])
      ).toBe(0);
      expect(
        await run([
          {
            _id: "region",
            countryId: country === "UK" ? "JP" : "UK",
            [field]: { law: { implementationFactor: 1, lastSettledTurn: 10 } },
          },
        ])
      ).toBe(0);
      expect(
        await run([
          {
            _id: "region",
            countryId: country,
            [field]: { law: { implementationFactor: 0.5, lastSettledTurn: 10 } },
          },
        ])
      ).toBe(0.4);
    }
  );
  it("rescales an unreplaced opening statute, without adding its full benefit twice", async () => {
    const db = createMockDb();
    const board = buildOpeningMetricSnapshots1991("world", 1).find((b) => b._id === "US:CA")!;
    const reference = openingLawReferences.find(
      (r) => r.country === "US" && r.scope === "national" && r.familyId === "L02"
    )!;
    db.collection("resetLawOpeningBoards").find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue([
          { countryId: "US", scope: "national", sourceTurn: 1, references: { L02: reference } },
        ]),
    });
    const run = async (factor: number) => {
      db.collection("resetDepartmentAccounts").find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: "account",
            countryId: "US",
            accruedThroughTurn: 10,
            familyAnnualDemand: { L02: 100 },
            lastProgramDelivery: { L02: { implementationFactor: factor } },
          },
        ]),
      });
      return (
        await loadResetPolicyPressure(db as unknown as Db, {
          worldId: "world",
          boards: [board],
          turn: 10,
        })
      ).get(board._id)!;
    };
    expect((await run(1))["03"] ?? 0).toBe(0);
    expect((await run(0))["03"]).toBeLessThan(0);
  });
});
