import { describe, expect, it } from "vitest";
import { cashWalkWindow, SNAPSHOT_GRACE_MS } from "./lastTurnReconciliation";

describe("cashWalkWindow", () => {
  const prev = new Date("2029-01-10T10:00:00Z");
  const latest = new Date("2029-01-10T11:00:00Z");

  it("windows the ledger by the two snapshot times, so an action stamped with the earlier turn still lands in the walk it moved", () => {
    const window = cashWalkWindow({ turn: 161, createdAt: latest }, { createdAt: prev }) as {
      createdAt: { $gt: Date; $lte: Date };
    };
    expect(window.createdAt.$gt.getTime()).toBe(prev.getTime() + SNAPSHOT_GRACE_MS);
    expect(window.createdAt.$lte.getTime()).toBe(latest.getTime() + SNAPSHOT_GRACE_MS);
    // An unlock bought 30 minutes after the first snapshot is inside the window.
    const bought = new Date("2029-01-10T10:30:00Z").getTime();
    expect(bought).toBeGreaterThan(window.createdAt.$gt.getTime());
    expect(bought).toBeLessThanOrEqual(window.createdAt.$lte.getTime());
  });

  it("falls back to the turn stamp when a snapshot has no creation time", () => {
    expect(cashWalkWindow({ turn: 161 }, { createdAt: prev })).toEqual({ turn: 161 });
    expect(cashWalkWindow({ turn: 161, createdAt: latest }, null)).toEqual({ turn: 161 });
  });
});
