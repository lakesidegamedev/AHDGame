import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { loadPovertyPolicyInputs } from "./povertyProvider";

describe("poverty funding provider", () => {
  it("loads existing national and regional laws in every v2 country in five bounded reads", async () => {
    const db = createMockDb();
    const countries = ["US", "UK", "JP", "IE", "SCO", "WAL"];
    const regions = countries.map((countryId) => ({ _id: `${countryId}-region`, countryId }));
    const programs = countries.flatMap((country) =>
      ["national", "regional"].map((scope) => ({
        _id: `${country}:${scope}`,
        country,
        scope,
        regionId: `${country}-region`,
        familyId: "L01",
        fundingAccountId: `${country}:account`,
        effectiveTurn: 2,
        primaryMetricEffects: [{ metricId: "03", favorableNormalizedPoints: 1 }],
      }))
    );
    function rows(name: string, data: unknown[]) {
      db.collection(name).find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(data) });
    }
    rows("resetLawPrograms", programs);
    rows(
      "resetDepartmentAccounts",
      countries.map((countryId) => ({
        _id: `${countryId}:account`,
        countryId,
        accruedThroughTurn: 10,
        lastProgramDelivery: { L01: { implementationFactor: 0.5 } },
      }))
    );
    const budget = (countryId: string) => ({
      _id: `${countryId}-region`,
      countryId,
      programSettlements: {
        [`${countryId}:regional`]: {
          implementationFactor: 0.25,
          lastSettledTurn: 9,
          validThroughTurn: 10,
        },
      },
      regionalProgramSettlements: {
        [`${countryId}:regional`]: {
          implementationFactor: 0.25,
          lastSettledTurn: 9,
          validThroughTurn: 10,
        },
      },
    });
    rows("stateBudgets", [budget("US")]);
    rows("regionalBudgets", countries.filter((id) => id !== "US").map(budget));
    const result = await loadPovertyPolicyInputs(db as unknown as Db, {
      worldId: "world",
      turn: 10,
      regions,
    });
    for (const region of regions) expect(result.get(region._id)?.deliveredPressure).toBe(0.75);
    for (const name of [
      "resetLawPrograms",
      "resetDepartmentAccounts",
      "stateBudgets",
      "regionalBudgets",
      "resetLawOpeningBoards",
    ]) {
      expect(db.collectionMocks[name]!.find).toHaveBeenCalledTimes(1);
      expect(db.collectionMocks[name]!.find.mock.calls[0]![1]).toHaveProperty("projection");
    }
    expect(db.collectionMocks.resetLawPrograms!.find.mock.calls[0]![0]).toMatchObject({
      worldId: "world",
      effectiveTurn: { $lte: 10 },
    });
  });

  it("does not assume full funding or query a legacy world", async () => {
    const db = createMockDb();
    expect(
      await loadPovertyPolicyInputs(db as unknown as Db, {
        worldId: "",
        turn: 10,
        regions: [{ _id: "LON", countryId: "UK" }],
      })
    ).toEqual(new Map());
    expect(db.collection).not.toHaveBeenCalled();
    const result = await loadPovertyPolicyInputs(db as unknown as Db, {
      worldId: "world",
      turn: 10,
      regions: [{ _id: "LON", countryId: "UK" }],
    });
    expect(result.get("LON")).toEqual({ deliveredPressure: 0 });
  });
});
