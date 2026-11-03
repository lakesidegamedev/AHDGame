import { describe, expect, it, vi } from "vitest";
import {
  NEWER_TURN_STARTED_MESSAGE,
  isWorldStillOnTurn,
  postLockTurnLogUpdate,
  runPostLockReporting,
  type PostLockReportingStep,
} from "@/simulation/engine/postLockReporting";
import type { TurnExecutionContext } from "@/simulation/engine/types";

vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));

function gameStateDb(state: Record<string, unknown> | null) {
  const updateOne = vi.fn();
  const findOne = vi.fn().mockResolvedValue(state);
  return { db: { collection: vi.fn().mockReturnValue({ findOne, updateOne }) }, updateOne };
}

function turnContext(db: unknown, newTurn = 552): TurnExecutionContext {
  return {
    db,
    newTurn,
    warnings: ["corporationTurn: slow"],
    phaseStatuses: {},
    phaseResults: {},
  } as unknown as TurnExecutionContext;
}

describe("runPostLockReporting", () => {
  it("runs steps in order, stamps each with the committed turn and never writes gameState", async () => {
    const { db, updateOne } = gameStateDb({ currentTurn: 552, isProcessing: false });
    const order: string[] = [];
    const stampedTurns: number[] = [];
    const steps: PostLockReportingStep[] = [
      {
        key: "first",
        phases: ["metricHistory"],
        async execute(context, runtime) {
          await runtime.runPhase("metricHistory", async () => {
            order.push("metricHistory");
            stampedTurns.push(context.newTurn);
          });
          context.phaseResults.metricHistory = { snapshotsTaken: 3 };
        },
      },
      {
        key: "second",
        phases: ["gameHealthSnapshot"],
        async execute(context, runtime) {
          await runtime.runPhase("gameHealthSnapshot", async () => {
            order.push("gameHealthSnapshot");
            stampedTurns.push(context.newTurn);
            // The turn's own warnings stay visible to the health grade.
            expect(context.warnings).toEqual(["corporationTurn: slow"]);
            expect(context.committedDurationMs).toBe(90_000);
          });
        },
      },
    ];

    const outcome = await runPostLockReporting({
      context: turnContext(db),
      committedDurationMs: 90_000,
      steps,
    });

    expect(order).toEqual(["metricHistory", "gameHealthSnapshot"]);
    expect(stampedTurns).toEqual([552, 552]);
    expect(outcome.status).toBe("completed");
    expect(outcome.turn).toBe(552);
    expect(outcome.phaseStatuses.metricHistory?.status).toBe("completed");
    expect(outcome.phaseStatuses.metricHistory?.startedAt).toBeInstanceOf(Date);
    expect(outcome.phaseStatuses.gameHealthSnapshot?.status).toBe("completed");
    expect(outcome.phaseResults.metricHistory).toEqual({ snapshotsTaken: 3 });
    // Lockless: no status mirror, no heartbeat, no lock check write.
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("skips and logs every remaining phase once a newer turn has started", async () => {
    const { db } = gameStateDb(null);
    const ran: string[] = [];
    const checks = [true, false];
    const steps: PostLockReportingStep[] = [
      {
        key: "chain",
        phases: ["metricHistory"],
        execute: async (_context, runtime) => {
          await runtime.runPhase("metricHistory", async () => ran.push("metricHistory"));
        },
      },
      {
        key: "closing",
        phases: ["portfolioSnapshot", "stockExchangeSnapshot"],
        execute: async (_context, runtime) => {
          await runtime.runPhase("portfolioSnapshot", async () => ran.push("portfolioSnapshot"));
        },
      },
      {
        key: "vitals",
        phases: ["economicVitalSigns"],
        execute: async (_context, runtime) => {
          await runtime.runPhase("economicVitalSigns", async () => ran.push("economicVitalSigns"));
        },
      },
    ];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const outcome = await runPostLockReporting({
      context: turnContext(db),
      committedDurationMs: 1,
      steps,
      isStillOnTurn: async () => checks.shift() ?? false,
    });

    expect(ran).toEqual(["metricHistory"]);
    expect(outcome.status).toBe("stopped");
    expect(outcome.reason).toContain("closing");
    for (const phase of ["portfolioSnapshot", "stockExchangeSnapshot", "economicVitalSigns"]) {
      expect(outcome.phaseStatuses[phase]).toMatchObject({
        status: "skipped",
        reason: "conditional",
        message: NEWER_TURN_STARTED_MESSAGE,
      });
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps going after a failed phase and reports it without throwing", async () => {
    const { db } = gameStateDb({ currentTurn: 552, isProcessing: false });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await runPostLockReporting({
      context: turnContext(db),
      committedDurationMs: 1,
      steps: [
        {
          key: "a",
          phases: ["approvalSnapshot"],
          execute: async (_c, runtime) => {
            await runtime.runPhase("approvalSnapshot", async () => {
              throw new Error("boom");
            });
          },
        },
        {
          key: "b",
          phases: ["wealthListSnapshot"],
          execute: async (_c, runtime) => {
            await runtime.runPhase("wealthListSnapshot", async () => 1);
          },
        },
      ],
    });
    expect(outcome.phaseStatuses.approvalSnapshot?.status).toBe("failed");
    expect(outcome.phaseStatuses.wealthListSnapshot?.status).toBe("completed");
    expect(outcome.warnings).toEqual(["approvalSnapshot: boom"]);
    error.mockRestore();
  });

  it("applies the turn's phase eligibility, so singleplayer still skips its excluded phases", async () => {
    const { db } = gameStateDb({ currentTurn: 552, isProcessing: false });
    const fn = vi.fn();
    const outcome = await runPostLockReporting({
      context: turnContext(db),
      committedDurationMs: 1,
      shouldRunPhase: (name) => name !== "gameHealthSnapshot",
      steps: [
        {
          key: "health",
          phases: ["gameHealthSnapshot"],
          execute: async (_c, runtime) => {
            await runtime.runPhase("gameHealthSnapshot", fn);
          },
        },
      ],
    });
    expect(fn).not.toHaveBeenCalled();
    expect(outcome.phaseStatuses.gameHealthSnapshot?.status).toBe("skipped");
  });
});

describe("isWorldStillOnTurn", () => {
  it.each([
    [{ currentTurn: 552, isProcessing: false }, true],
    [{ currentTurn: 552, isProcessing: true }, false],
    [{ currentTurn: 553, isProcessing: false }, false],
    [null, false],
  ])("%o -> %s", async (state, expected) => {
    const { db } = gameStateDb(state);
    await expect(isWorldStillOnTurn(db as never, 552)).resolves.toBe(expected);
  });
});

describe("postLockTurnLogUpdate", () => {
  it("merges statuses and results under the in-lock keys plus a run summary", () => {
    const startedAt = new Date("2026-10-30T20:00:00Z");
    const completedAt = new Date("2026-10-30T20:00:12Z");
    const set = postLockTurnLogUpdate({
      turn: 552,
      status: "completed",
      startedAt,
      completedAt,
      phaseStatuses: { metricHistory: { status: "completed" } as never },
      phaseResults: { metricHistory: { snapshotsTaken: 2 } } as never,
      warnings: [],
    });
    expect(set).toEqual({
      postLockReporting: { status: "completed", startedAt, completedAt, ms: 12_000 },
      "phaseStatuses.metricHistory": { status: "completed" },
      "phases.metricHistory": { snapshotsTaken: 2 },
    });
  });
});
