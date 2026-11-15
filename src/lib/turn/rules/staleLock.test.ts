import { describe, expect, it } from "vitest";
import {
  TURN_LOCK_FAST_STALE_MS,
  parseHolderId,
  resolveTurnResilienceStage,
  shouldFastTakeOverStaleLock,
} from "./staleLock";

const self = { host: "host-a" };
const dead = () => false;
const alive = () => true;
const now = new Date("2027-01-01T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const lock = (over = {}) => ({
  isProcessing: true,
  processingKind: "turn",
  processingHolderId: "host-a:10:old-boot",
  processingHeartbeatAt: ago(TURN_LOCK_FAST_STALE_MS + 1000),
  processingAbandonedAt: null,
  ...over,
});

describe("shouldFastTakeOverStaleLock", () => {
  it("takes over a turn lock with an old heartbeat at stage 1", () => {
    expect(shouldFastTakeOverStaleLock(lock(), now, 1, self, dead)).toBe(true);
  });
  it("never acts at stage 0", () => {
    expect(shouldFastTakeOverStaleLock(lock(), now, 0, self, dead)).toBe(false);
  });
  it("leaves a fresh heartbeat alone", () => {
    expect(
      shouldFastTakeOverStaleLock(lock({ processingHeartbeatAt: ago(60_000) }), now, 1, self, dead)
    ).toBe(false);
  });
  it("leaves other lock kinds, already abandoned locks and holderless locks alone", () => {
    expect(
      shouldFastTakeOverStaleLock(lock({ processingKind: "forexMigration" }), now, 1, self, dead)
    ).toBe(false);
    expect(
      shouldFastTakeOverStaleLock(lock({ processingAbandonedAt: ago(1) }), now, 1, self, dead)
    ).toBe(false);
    expect(
      shouldFastTakeOverStaleLock(lock({ processingHolderId: null }), now, 1, self, dead)
    ).toBe(false);
    expect(shouldFastTakeOverStaleLock(lock({ isProcessing: false }), now, 1, self, dead)).toBe(
      false
    );
    expect(shouldFastTakeOverStaleLock(null, now, 1, self, dead)).toBe(false);
  });
});

describe("takeover tiers", () => {
  it("never fast-takes a live holder, even a stopped one", () => {
    expect(shouldFastTakeOverStaleLock(lock(), now, 1, self, alive)).toBe(false);
  });
  it("probes the pid carried in the holder id", () => {
    const probe = (pid: number) => pid === 11;
    expect(shouldFastTakeOverStaleLock(lock(), now, 1, self, probe)).toBe(true);
    expect(
      shouldFastTakeOverStaleLock(lock({ processingHolderId: "host-a:11:b" }), now, 1, self, probe)
    ).toBe(false);
  });
  it("leaves a holder on another host or an unreadable id to the long window", () => {
    expect(
      shouldFastTakeOverStaleLock(lock({ processingHolderId: "host-b:10:x" }), now, 1, self, dead)
    ).toBe(false);
    expect(
      shouldFastTakeOverStaleLock(lock({ processingHolderId: "garbage" }), now, 1, self, dead)
    ).toBe(false);
    expect(
      shouldFastTakeOverStaleLock(lock({ processingHolderId: "host-a:nan:x" }), now, 1, self, dead)
    ).toBe(false);
  });
  it("parses ids whose host contains colons", () => {
    expect(parseHolderId("fd00::1:42:boot")).toEqual({
      host: "fd00::1",
      pid: "42",
      bootId: "boot",
    });
    expect(parseHolderId("a:b")).toBeNull();
    expect(parseHolderId(null)).toBeNull();
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
