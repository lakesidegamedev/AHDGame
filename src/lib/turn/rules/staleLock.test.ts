import { describe, expect, it } from "vitest";
import {
  TURN_LOCK_FAST_STALE_MS,
  resolveTurnResilienceStage,
  shouldFastTakeOverStaleLock,
} from "./staleLock";

const now = new Date("2027-01-01T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const lock = (over = {}) => ({
  isProcessing: true,
  processingKind: "turn",
  processingHolderId: "w1:10:abc",
  processingHeartbeatAt: ago(TURN_LOCK_FAST_STALE_MS + 1000),
  processingAbandonedAt: null,
  ...over,
});

describe("shouldFastTakeOverStaleLock", () => {
  it("takes over a turn lock with an old heartbeat at stage 1", () => {
    expect(shouldFastTakeOverStaleLock(lock(), now, 1)).toBe(true);
  });
  it("never acts at stage 0", () => {
    expect(shouldFastTakeOverStaleLock(lock(), now, 0)).toBe(false);
  });
  it("leaves a fresh heartbeat alone", () => {
    expect(shouldFastTakeOverStaleLock(lock({ processingHeartbeatAt: ago(60_000) }), now, 1)).toBe(
      false
    );
  });
  it("leaves other lock kinds, already abandoned locks and holderless locks alone", () => {
    expect(shouldFastTakeOverStaleLock(lock({ processingKind: "forexMigration" }), now, 1)).toBe(
      false
    );
    expect(shouldFastTakeOverStaleLock(lock({ processingAbandonedAt: ago(1) }), now, 1)).toBe(
      false
    );
    expect(shouldFastTakeOverStaleLock(lock({ processingHolderId: null }), now, 1)).toBe(false);
    expect(shouldFastTakeOverStaleLock(lock({ isProcessing: false }), now, 1)).toBe(false);
    expect(shouldFastTakeOverStaleLock(null, now, 1)).toBe(false);
  });
});

describe("resolveTurnResilienceStage", () => {
  it("defaults to 0 and reads config", () => {
    expect(
      resolveTurnResilienceStage({ configStage: undefined, simSandbox: false, envStage: "" })
    ).toBe(0);
    expect(
      resolveTurnResilienceStage({ configStage: 1, simSandbox: false, envStage: undefined })
    ).toBe(1);
  });
  it("honours the env override only in a sandbox", () => {
    expect(resolveTurnResilienceStage({ configStage: 0, simSandbox: true, envStage: "1" })).toBe(1);
    expect(resolveTurnResilienceStage({ configStage: 0, simSandbox: false, envStage: "1" })).toBe(
      0
    );
  });
});
