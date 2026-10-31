import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ phase: string; turn: number }> = [];
const health = { severity: "ok" };

vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/turn/gameHealthSnapshot", () => ({
  processGameHealthSnapshot: vi.fn(async (_db: unknown, turn: number, _y: number, ms: number) => {
    calls.push({ phase: "gameHealthSnapshot", turn });
    expect(ms).toBe(80_000);
    return { snapshotWritten: true, integrityCheckRan: false, health };
  }),
}));
vi.mock("@/lib/turn/partyHistorySnapshot", () => ({
  snapshotPartyHistory: vi.fn(async (_db: unknown, turn: number) => {
    calls.push({ phase: "partyHistorySnapshot", turn });
  }),
}));
vi.mock("@/lib/telemetry/longHorizon/telemetry", () => ({
  resolveLongHorizonContext: vi.fn(async (_db: unknown, turn: number) => {
    calls.push({ phase: "researchTelemetry", turn });
    return null;
  }),
}));
vi.mock("@/lib/turn/portfolioSnapshot", () => ({
  snapshotPortfolioValues: vi.fn(async (turn: number) => {
    calls.push({ phase: "portfolioSnapshot", turn });
    return 7;
  }),
  snapshotCorporationPortfolioValues: vi.fn(async (turn: number) => {
    calls.push({ phase: "corpPortfolioSnapshot", turn });
  }),
}));
vi.mock("@/lib/turn/stockExchangeSnapshot", () => ({
  generateInvestorRankingSnapshot: vi.fn(async (turn: number) => {
    calls.push({ phase: "investorRankingSnapshot", turn });
  }),
}));

import { runCommittedTurnReporting } from "@/lib/turn/committedTurnReporting";

function harness(gameState: Record<string, unknown> | null) {
  const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
  const findOne = vi.fn().mockResolvedValue(gameState);
  const collection = vi.fn((name: string) => ({ name, updateOne, findOne }));
  const context = {
    db: { collection },
    newTurn: 552,
    currentYear: 1961,
    gameState: { stockHoldingTaxStartTurn: 10 },
    warnings: [],
    phaseStatuses: {},
    phaseResults: {},
  };
  return { context, updateOne, collection };
}

describe("runCommittedTurnReporting", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("grades health first, stamps every phase with the committed turn, and merges into the turn log", async () => {
    const { context, updateOne, collection } = harness({ currentTurn: 552, isProcessing: false });
    const turnLogId = new ObjectId();

    const result = await runCommittedTurnReporting({
      context: context as never,
      committedDurationMs: 80_000,
      turnLogId,
    });

    expect(calls[0]).toEqual({ phase: "gameHealthSnapshot", turn: 552 });
    expect(calls.map((c) => c.phase).sort()).toEqual(
      [
        "corpPortfolioSnapshot",
        "gameHealthSnapshot",
        "investorRankingSnapshot",
        "partyHistorySnapshot",
        "portfolioSnapshot",
        "researchTelemetry",
      ].sort()
    );
    expect(calls.every((c) => c.turn === 552)).toBe(true);
    expect(result).toEqual({ health, healthWritten: true });

    // Only the turn log is written; gameState is read for the turn check, never updated.
    expect(updateOne).toHaveBeenCalledOnce();
    expect(collection).toHaveBeenCalledWith("turnLogs");
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: turnLogId });
    expect(update.$set.health).toBe(health);
    expect(update.$set.postLockReporting.status).toBe("completed");
    expect(update.$set["phaseStatuses.gameHealthSnapshot"].status).toBe("completed");
    expect(update.$set["phaseStatuses.investorRankingSnapshot"].status).toBe("completed");
    expect(update.$set["phases.portfolioSnapshot"]).toEqual({ charactersSnapshotted: 7 });
  });

  it("writes nothing for a turn the world has already moved past", async () => {
    const { context, updateOne } = harness({ currentTurn: 553, isProcessing: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await runCommittedTurnReporting({
      context: context as never,
      committedDurationMs: 80_000,
      turnLogId: new ObjectId(),
    });

    expect(calls).toEqual([]);
    expect(result).toEqual({ health: null, healthWritten: false });
    const update = updateOne.mock.calls[0][1];
    expect(update.$set.postLockReporting.status).toBe("stopped");
    expect(update.$set["phaseStatuses.gameHealthSnapshot"].status).toBe("skipped");
    warn.mockRestore();
  });

  it("never throws, so a committed turn cannot fall into the failure path", async () => {
    const { context, updateOne } = harness({ currentTurn: 552, isProcessing: false });
    updateOne.mockRejectedValueOnce(new Error("primary stepped down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runCommittedTurnReporting({
        context: context as never,
        committedDurationMs: 80_000,
        turnLogId: new ObjectId(),
      })
    ).resolves.toEqual({ health: null, healthWritten: false });
    error.mockRestore();
  });

  it("runs without a turn log in singleplayer", async () => {
    const { context, updateOne } = harness({ currentTurn: 552, isProcessing: false });
    const result = await runCommittedTurnReporting({
      context: context as never,
      committedDurationMs: 80_000,
      turnLogId: null,
    });
    expect(result.healthWritten).toBe(true);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
