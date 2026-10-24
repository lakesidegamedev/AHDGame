import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deferAfterTurn,
  drainDeferredTurnWork,
  drainDeferredTurnWorkWithin,
  pendingDeferredTurnWork,
} from "./deferredTurnWork";

afterEach(async () => {
  await drainDeferredTurnWork();
  vi.restoreAllMocks();
});

describe("deferred turn work", () => {
  it("runs queued jobs in order, only when drained", async () => {
    const order: string[] = [];
    deferAfterTurn("a", async () => void order.push("a"));
    deferAfterTurn("b", async () => void order.push("b"));
    expect(order).toEqual([]);
    expect(pendingDeferredTurnWork()).toBe(2);
    await drainDeferredTurnWork();
    expect(order).toEqual(["a", "b"]);
    expect(pendingDeferredTurnWork()).toBe(0);
  });

  it("keeps draining after a job fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ran: string[] = [];
    deferAfterTurn("fails", async () => {
      throw new Error("boom");
    });
    deferAfterTurn("after", async () => void ran.push("after"));
    await drainDeferredTurnWork();
    expect(ran).toEqual(["after"]);
  });

  it("shares one drain between concurrent callers, including work queued meanwhile", async () => {
    const ran: string[] = [];
    let release!: () => void;
    deferAfterTurn("slow", () => new Promise<void>((resolve) => (release = resolve)));
    const first = drainDeferredTurnWork();
    deferAfterTurn("late", async () => void ran.push("late"));
    const second = drainDeferredTurnWork();
    expect(second).toBe(first);
    release();
    await second;
    expect(ran).toEqual(["late"]);
  });

  it("gives up waiting at the shutdown deadline without dropping the job", async () => {
    let release!: () => void;
    deferAfterTurn("slow", () => new Promise<void>((resolve) => (release = resolve)));
    expect(await drainDeferredTurnWorkWithin(5)).toBe(false);
    release();
    expect(await drainDeferredTurnWorkWithin(1_000)).toBe(true);
  });
});
