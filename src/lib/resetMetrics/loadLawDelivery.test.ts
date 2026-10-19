import { describe, it, expect, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { loadMetricLawDelivery } from "./loadLawDelivery";
import { loadResetPolicyPressure } from "./loadPolicyPressure";
import { deliveredMetricEffects } from "./rules/lawDelivery";
import { buildOpeningMetricSnapshots1991 } from "./seedOpening1991";
import { openingLawReferences } from "@/lib/resetLegislation/openingLaw";

describe("shared existing-law funding loader", () => {
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
