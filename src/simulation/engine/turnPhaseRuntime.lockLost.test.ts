import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnPhaseTelemetryMap } from "@/lib/db/types";
import { createTurnPhaseRuntime } from "@/simulation/engine/turnPhaseRuntime";
import { TURN_LOCK_HEARTBEAT_MS } from "@/lib/turn/processingLock";
import {
  TurnLockLostError,
  setTurnLockFence,
  turnLockFenceFilter,
} from "@/lib/turn/turnLockHolder";

vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));

function runtimeWith(matchedCount: number) {
  const updateOne = vi.fn().mockResolvedValue({ acknowledged: true, matchedCount });
  const phaseStatuses: TurnPhaseTelemetryMap = {};
  const runtime = createTurnPhaseRuntime({
    db: { collection: vi.fn().mockReturnValue({ updateOne }) },
    phaseStatuses,
    warnings: [],
    currentPhaseRef: { current: null },
  });
  return { runtime, updateOne };
}

describe("lock lost", () => {
  beforeEach(() => {
    setTurnLockFence("host:1:boot");
  });
  afterEach(() => {
    setTurnLockFence(null);
    vi.useRealTimers();
  });

  it("fences on holder id and the abandon marker", () => {
    expect(turnLockFenceFilter()).toEqual({
      processingHolderId: "host:1:boot",
      processingAbandonedAt: null,
    });
  });

  it("refuses to start a phase once the lock is gone, without running it", async () => {
    const { runtime } = runtimeWith(0);
    const fn = vi.fn(async () => 1);
    await expect(runtime.runPhase("bondTurn", fn)).rejects.toBeInstanceOf(TurnLockLostError);
    expect(fn).not.toHaveBeenCalled();
    await expect(runtime.runPhase("treasuryTurn", fn)).rejects.toBeInstanceOf(TurnLockLostError);
  });

  it("stops the turn when a heartbeat finds the lock gone mid-phase", async () => {
    vi.useFakeTimers();
    const updateOne = vi
      .fn()
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockResolvedValue({ matchedCount: 0 });
    const runtime = createTurnPhaseRuntime({
      db: { collection: vi.fn().mockReturnValue({ updateOne }) },
      phaseStatuses: {},
      warnings: [],
      currentPhaseRef: { current: null },
    });
    const result = runtime.runPhase("bondTurn", () => new Promise<number>(() => {}));
    const assertion = expect(result).rejects.toBeInstanceOf(TurnLockLostError);
    await vi.advanceTimersByTimeAsync(TURN_LOCK_HEARTBEAT_MS + 10);
    await assertion;
  });
});
