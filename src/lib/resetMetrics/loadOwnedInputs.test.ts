import { describe, it, expect, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { RESET_V2_SEED_REVISION } from "@/lib/resetVersions/rules";
import { buildOpeningMetricSnapshots1991 } from "./seedOpening1991";
import { loadOwnedMetricInputs } from "./loadOwnedInputs";
import { loadPoliticalMacroInputs } from "@/lib/politicalLegislation/politicalMacroInputs";

describe("world-bound causal owner reads", () => {
  function fixture() {
    const db = createMockDb();
    db.collection("gameState").findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 10,
      currentYear: 1991,
      resetWorldId: "world",
      metricsSystemVersion: "v2",
      resetVersionSeeds: {
        metrics: {
          worldId: "world",
          revision: RESET_V2_SEED_REVISION.metrics,
          sourceTurn: 1,
          completedAt: "fixture",
          verificationHash: "fixture",
          countries: ["UK"],
        },
      },
    });
    const board = buildOpeningMetricSnapshots1991("world", 1).find((b) => b._id === "UK:LON")!;
    board.asOfTurn = 10;
    board.observations["04"] = { ...board.observations["04"]!, value: 20 };
    db.collection("resetMetricSnapshots").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([board]),
    });
    return { db, board };
  }
  it("returns the exact published raw metric to gameplay consumers", async () => {
    const { db } = fixture();
    const inputs = await loadPoliticalMacroInputs(db as unknown as Db, 11);
    expect(inputs.legacyUnit("LON", "social.incomeInequality")).toBe(20);
    expect(inputs.legacyValue("LON", "social.incomeInequality")).toBe(20);
    expect(db.collectionMocks.resetMetricSnapshots!.find.mock.calls[0]![0]).toMatchObject({
      worldId: "world",
      scope: "regional",
    });
  });
  it("reuses compact preceding values when replaying a turn after publication", async () => {
    const { db, board } = fixture();
    board.priorValues = { "04": 40 };
    const inputs = await loadOwnedMetricInputs(db as unknown as Db, 10);
    expect(inputs.get("LON")?.values["social.incomeInequality"]).toBe(40);
    expect(
      (await loadOwnedMetricInputs(db as unknown as Db)).get("LON")?.values[
        "social.incomeInequality"
      ]
    ).toBe(20);
  });
  it("does not reinterpret a legacy world or invent a missing preceding snapshot", async () => {
    const { db } = fixture();
    expect((await loadOwnedMetricInputs(db as unknown as Db, 10)).size).toBe(0);
    db.collection("gameState").findOne.mockResolvedValue({ _id: "current", currentTurn: 10 });
    expect((await loadOwnedMetricInputs(db as unknown as Db)).size).toBe(0);
  });
});
