import { describe, expect, it } from "vitest";

import type { TurnPhaseTelemetry, TurnPhaseTelemetryMap } from "@/lib/db/types/turnPhaseTelemetry";
import { completedMarketUpdateAt, completedTurnStatus } from "./turnCompletion";

describe("completed market update clock", () => {
  const completed: TurnPhaseTelemetry = {
    status: "completed",
    startedAt: new Date("2026-10-09T05:01:00Z"),
    completedAt: new Date("2026-10-09T05:01:05Z"),
    updatedAt: new Date("2026-10-09T05:01:05Z"),
    reason: null,
    message: null,
  };

  it("uses the actual snapshot completion time, including a carried completed phase", () => {
    expect(completedMarketUpdateAt({ stockExchangeSnapshot: completed })).toEqual(
      completed.completedAt
    );
    expect(
      completedMarketUpdateAt({
        stockExchangeSnapshot: { ...completed, resumeCarried: "completed" },
      })
    ).toEqual(completed.completedAt);
  });

  it("does not advance market freshness for failed, skipped or absent snapshots", () => {
    expect(completedMarketUpdateAt({})).toBeNull();
    expect(
      completedMarketUpdateAt({ stockExchangeSnapshot: { ...completed, status: "failed" } })
    ).toBeNull();
    expect(
      completedMarketUpdateAt({ stockExchangeSnapshot: { ...completed, status: "skipped" } })
    ).toBeNull();
  });

  it("does not publish missing or invalid completion times", () => {
    expect(
      completedMarketUpdateAt({ stockExchangeSnapshot: { ...completed, completedAt: null } })
    ).toBeNull();
    expect(
      completedMarketUpdateAt({
        stockExchangeSnapshot: { ...completed, completedAt: new Date(Number.NaN) },
      })
    ).toBeNull();
  });
});

const phases = (statuses: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(statuses).map(([phase, entry]) => {
      const [status, reason = null] = entry.split(":");
      return [phase, { status, reason }];
    })
  ) as unknown as TurnPhaseTelemetryMap;

describe("completedTurnStatus", () => {
  it("keeps advisory warnings without reporting a committed turn as failed", () => {
    expect(completedTurnStatus(["corporationTurn: clearing invariant breach"])).toMatchObject({
      success: true,
      outcome: "clean",
      failedPhases: [],
      abortedPhases: [],
      warningCount: 1,
    });
  });

  it("reports a warning-free committed turn as clean", () => {
    expect(completedTurnStatus([])).toMatchObject({
      success: true,
      outcome: "clean",
      failedPhases: [],
      abortedPhases: [],
      warningCount: 0,
    });
  });

  it("marks a committed turn with a failed phase as degraded", () => {
    const status = completedTurnStatus(
      ["resetMetricRefresh: replay differs"],
      phases({
        corporationTurn: "completed",
        resetMetricRefresh: "failed",
        decolonization: "skipped",
      })
    );
    expect(status).toMatchObject({
      success: true,
      outcome: "degraded",
      failedPhases: ["resetMetricRefresh"],
      abortedPhases: [],
      warningCount: 1,
    });
  });

  it("marks phases skipped after an upstream failure as degraded", () => {
    const status = completedTurnStatus(
      [],
      phases({ bondTurn: "failed", treasuryTurn: "skipped:upstreamAbort" })
    );
    expect(status.outcome).toBe("degraded");
    expect(status.abortedPhases).toEqual(["treasuryTurn"]);
  });

  it("is not a success when a money-moving step was interrupted and skipped", () => {
    const status = completedTurnStatus([], phases({ corporationTurn: "completed" }), ["bondTurn"]);
    expect(status.success).toBe(false);
    expect(status.outcome).toBe("incomplete");
    expect(status.incompleteSteps).toEqual(["bondTurn"]);
  });

  it("is not a success when a step never ran", () => {
    const status = completedTurnStatus([], phases({ billLifecycle: "notReached" }));
    expect(status.success).toBe(false);
    expect(status.stepAccounting.neverRan).toEqual(["billLifecycle"]);
  });

  it("accounts for ran, already done and interrupted steps", () => {
    const status = completedTurnStatus([], {
      a: { status: "completed" },
      b: { status: "skipped", resumeCarried: "completed" },
      c: { status: "failed", resumeCarried: "interrupted" },
    } as unknown as TurnPhaseTelemetryMap);
    expect(status.stepAccounting).toEqual({
      ran: ["a"],
      skippedAlreadyDone: ["b"],
      interruptedNotRerun: ["c"],
      neverRan: [],
    });
    expect(status.success).toBe(true);
  });

  it("does not call a resumed turn degraded because finished steps were skipped", () => {
    const status = completedTurnStatus([], {
      fundGeneration: { status: "skipped", reason: "upstreamAbort", resumeCarried: "completed" },
      bondTurn: { status: "completed" },
    } as unknown as TurnPhaseTelemetryMap);
    expect(status.outcome).toBe("clean");
    expect(status.abortedPhases).toEqual([]);
  });

  it("treats conditionally skipped phases as clean", () => {
    expect(
      completedTurnStatus(
        [],
        phases({ corporationTurn: "completed", decolonization: "skipped:conditional" })
      ).outcome
    ).toBe("clean");
  });
});
