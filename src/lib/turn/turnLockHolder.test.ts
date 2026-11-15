import { describe, expect, it, vi } from "vitest";
import { TURN_HOLDER_ID, tryFastStaleLockTakeover } from "./turnLockHolder";

// A pid that is certainly not running: above any pid_max.
const deadPid = 4_194_999;
const selfHost = TURN_HOLDER_ID.split(":").slice(0, -2).join(":");

function dbWith(lock: Record<string, unknown> | null, modifiedCount = 1) {
  const updateOne = vi.fn().mockResolvedValue({ modifiedCount });
  const findOne = vi.fn().mockResolvedValue(lock);
  return { updateOne, db: { collection: () => ({ findOne, updateOne }) } as never };
}
const now = new Date("2027-01-01T12:00:00Z");
const stale = new Date(now.getTime() - 5 * 60_000);
const staleLock = {
  isProcessing: true,
  processingKind: "turn",
  processingHolderId: `${selfHost}:${deadPid}:previous-boot`,
  processingHeartbeatAt: stale,
};

describe("tryFastStaleLockTakeover", () => {
  it("compare-and-sets on the exact holder and heartbeat it read", async () => {
    const { db, updateOne } = dbWith(staleLock);
    await expect(tryFastStaleLockTakeover(db, 1, now)).resolves.toBe(true);
    expect(updateOne.mock.calls[0][0]).toMatchObject({
      processingHolderId: `${selfHost}:${deadPid}:previous-boot`,
      processingHeartbeatAt: stale,
    });
  });
  it("loses cleanly when the holder renewed between read and write", async () => {
    const { db } = dbWith(staleLock, 0);
    await expect(tryFastStaleLockTakeover(db, 1, now)).resolves.toBe(false);
  });
  it("never takes over a holder whose pid is alive", async () => {
    const { db, updateOne } = dbWith({
      ...staleLock,
      processingHolderId: `${selfHost}:${process.ppid}:other-boot`,
    });
    await expect(tryFastStaleLockTakeover(db, 1, now)).resolves.toBe(false);
    expect(updateOne).not.toHaveBeenCalled();
  });
  it("leaves a holder on another host to the long stale window", async () => {
    const { db, updateOne } = dbWith({ ...staleLock, processingHolderId: "elsewhere:1:x" });
    await expect(tryFastStaleLockTakeover(db, 1, now)).resolves.toBe(false);
    expect(updateOne).not.toHaveBeenCalled();
  });
  it("does nothing at stage 0, for a fresh lock, or for its own lock", async () => {
    const a = dbWith(staleLock);
    await expect(tryFastStaleLockTakeover(a.db, 0, now)).resolves.toBe(false);
    expect(a.updateOne).not.toHaveBeenCalled();
    const b = dbWith({ ...staleLock, processingHeartbeatAt: now });
    await expect(tryFastStaleLockTakeover(b.db, 1, now)).resolves.toBe(false);
    const c = dbWith({ ...staleLock, processingHolderId: TURN_HOLDER_ID });
    await expect(tryFastStaleLockTakeover(c.db, 1, now)).resolves.toBe(false);
  });
});
