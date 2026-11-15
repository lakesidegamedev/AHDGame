import { describe, expect, it } from "vitest";
import type { TurnPhaseTelemetryMap } from "@/lib/db/types";
import { shouldFastTakeOverStaleLock } from "@/lib/turn/rules/staleLock";
import { validateLockedResume } from "./turnResumeBootstrap";
import { TurnHeldForRepairError, isResumeFailClosedError } from "./turnPhaseResumeResults";

const st = (status: string, message: string | null = null) =>
  ({
    status,
    startedAt: null,
    completedAt: null,
    updatedAt: new Date(),
    reason: null,
    message,
  }) as never;

function locked(statuses: Record<string, unknown>) {
  return {
    currentTurn: 2,
    processingTargetTurn: 3,
    processingPhase: "bondTurn",
    processingPhaseStatuses: statuses as TurnPhaseTelemetryMap,
    processingPhaseResults: {},
  };
}

describe("hold on a mid-turn death (stage 1)", () => {
  it("holds, skipping and rerunning nothing, when a money step was in flight", () => {
    const l = locked({
      fundGeneration: st("completed"),
      bondTurn: st("running"),
      approvalSnapshot: st("running"),
    });
    let thrown: unknown;
    try {
      validateLockedResume(l, 3, new Set(), true);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(TurnHeldForRepairError);
    const held = thrown as TurnHeldForRepairError;
    expect(held.phases).toEqual(["bondTurn"]);
    expect(held.details.bondTurn).toBe("process died");
    expect(isResumeFailClosedError(held)).toBe(true);
  });
  it("carries the real error text when the dead holder left one", () => {
    const l = locked({ bondTurn: st("failed", "coupon mismatch") });
    expect(() => validateLockedResume(l, 3, new Set(), true)).toThrow(/bondTurn/);
    try {
      validateLockedResume(l, 3, new Set(), true);
    } catch (e) {
      expect((e as TurnHeldForRepairError).details.bondTurn).toBe("coupon mismatch");
    }
  });
  it("resumes when only allow-listed steps were in flight", () => {
    const l = locked({
      fundGeneration: st("completed"),
      approvalSnapshot: st("running"),
      metricDecay: st("running"),
    });
    const r = validateLockedResume(l, 3, new Set(), true);
    expect(r?.interruptedMoneyMoving).toEqual([]);
    expect([...(r?.appliedPhases ?? [])].sort()).toEqual([
      "approvalSnapshot",
      "fundGeneration",
      "metricDecay",
    ]);
  });
  it("without the stage it resumes and reports the skipped money step", () => {
    const l = locked({ bondTurn: st("running") });
    expect(validateLockedResume(l, 3, new Set(), false)?.interruptedMoneyMoving).toEqual([
      "bondTurn",
    ]);
  });
});

describe("rerun-safe steps (stage 2)", () => {
  it("reruns an interrupted treasuryTurn instead of holding or skipping it", () => {
    const l = locked({ fundGeneration: st("completed"), treasuryTurn: st("running") });
    const r = validateLockedResume(l, 3, new Set(), true, true);
    expect(r?.interruptedMoneyMoving).toEqual([]);
    expect([...(r?.appliedPhases ?? [])]).toEqual(["fundGeneration"]);
  });
  it("still holds when a rerun-safe step was in flight beside an unproven money step", () => {
    const l = locked({ treasuryTurn: st("running"), bondTurn: st("running") });
    expect(() => validateLockedResume(l, 3, new Set(), true, true)).toThrow(TurnHeldForRepairError);
  });
  it.each(["treasuryTurn", "savingsInterestTurn", "pensionTurn"])(
    "at stage 1 an interrupted %s is held, at stage 2 it is rerun",
    (step) => {
      const l = locked({ [step]: st("running") });
      expect(() => validateLockedResume(l, 3, new Set(), true, false)).toThrow(
        TurnHeldForRepairError
      );
      expect(validateLockedResume(l, 3, new Set(), true, true)?.interruptedMoneyMoving).toEqual([]);
    }
  );
  it("without the stage nothing is rerun and the step counts as skipped money", () => {
    const l = locked({ treasuryTurn: st("running") });
    const r = validateLockedResume(l, 3, new Set(), false);
    expect(r?.interruptedMoneyMoving).toEqual(["treasuryTurn"]);
    expect([...(r?.appliedPhases ?? [])]).toEqual(["treasuryTurn"]);
  });
});

describe("watchdog refuses a held lock", () => {
  it("never fast-takes over a lock with a hold reason", () => {
    const now = new Date("2027-01-01T12:00:00Z");
    const lock = {
      isProcessing: true,
      processingKind: "turn",
      processingHolderId: "h:10:b",
      processingHeartbeatAt: new Date(now.getTime() - 10 * 60_000),
      processingAbandonedAt: null,
      processingHoldReason: "held",
    };
    expect(shouldFastTakeOverStaleLock(lock, now, 1, { host: "h" }, () => false)).toBe(false);
    expect(
      shouldFastTakeOverStaleLock(
        { ...lock, processingHoldReason: null },
        now,
        1,
        { host: "h" },
        () => false
      )
    ).toBe(true);
  });
});
