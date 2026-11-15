import { describe, expect, it, vi } from "vitest";
import { createTurnRetryController, type TurnRetryRecord } from "./turnRetry";

const failing = (retryable = true) => ({
  success: false,
  failure: { phase: "treasuryTurn", target: 9, retryable },
});

function harness(
  results: Array<{ success: boolean; failure?: never } | ReturnType<typeof failing>>
) {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const records: TurnRetryRecord[] = [];
  const alert = vi.fn();
  const run = vi.fn(async () => results.shift() ?? { success: true });
  const c = createTurnRetryController({
    run,
    record: (e) => void records.push(e),
    setTimer: (fn, ms) => void timers.push({ fn, ms }),
    alert,
  });
  const fire = async () => {
    timers.shift()!.fn();
    await new Promise((r) => setImmediate(r));
  };
  return { c, timers, records, alert, run, fire };
}

describe("turn retry controller", () => {
  it("retries once after a stop and records the story", async () => {
    const h = harness([{ success: true }]);
    await h.c.onResult(failing());
    expect(h.timers[0].ms).toBe(60_000);
    await h.fire();
    expect(h.run).toHaveBeenCalledWith({ attempt: 1, of: 3, afterPhase: "treasuryTurn" });
    expect(h.records.map((r) => r.outcome)).toEqual(["scheduled", "succeeded"]);
    expect(h.alert).not.toHaveBeenCalled();
  });
  it("stops and alerts after three failed attempts", async () => {
    const h = harness([failing(), failing(), failing()]);
    await h.c.onResult(failing());
    await h.fire();
    await h.fire();
    await h.fire();
    expect(h.run).toHaveBeenCalledTimes(3);
    expect(h.timers).toHaveLength(0);
    expect(h.alert).toHaveBeenCalledTimes(1);
    expect(h.records.at(-1)?.outcome).toBe("exhausted");
  });
  it("does not retry an unsafe step and alerts when a retry was already under way", async () => {
    const h = harness([failing(false)]);
    await h.c.onResult(failing());
    await h.fire();
    expect(h.timers).toHaveLength(0);
    expect(h.alert).toHaveBeenCalledTimes(1);
    expect(h.records.at(-1)?.outcome).toBe("stopped");
  });
  it("schedules only one pending retry", async () => {
    const h = harness([]);
    await h.c.onResult(failing());
    await h.c.onResult(failing());
    expect(h.timers).toHaveLength(1);
  });
});
