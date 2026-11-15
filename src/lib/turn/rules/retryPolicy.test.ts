import { describe, expect, it } from "vitest";
import { TURN_RETRY_DELAYS_MS, decideTurnRetry } from "./retryPolicy";

const fail = (retryable = true, target: number | null = 5) => ({
  success: false,
  failure: { phase: "bondTurn", target, retryable },
});

describe("decideTurnRetry", () => {
  it("walks 1, 3, 9 minutes then stops", () => {
    let state = { key: null as string | null, attempts: 0 };
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      const d = decideTurnRetry(state, fail());
      expect(d.action).toBe("retry");
      if (d.action === "retry") {
        delays.push(d.delayMs);
        state = d.state;
      }
    }
    expect(delays).toEqual([...TURN_RETRY_DELAYS_MS]);
    expect(decideTurnRetry(state, fail())).toMatchObject({ action: "stop", reason: "exhausted" });
  });
  it("stops at once when the failure is not retryable", () => {
    expect(decideTurnRetry({ key: null, attempts: 0 }, fail(false))).toMatchObject({
      action: "stop",
      reason: "not-retryable",
    });
  });
  it("resets on success and restarts the count for a different turn", () => {
    expect(decideTurnRetry({ key: "5", attempts: 2 }, { success: true }).state.attempts).toBe(0);
    const d = decideTurnRetry({ key: "5", attempts: 2 }, fail(true, 6));
    expect(d).toMatchObject({ action: "retry", attempt: 1 });
  });
  it("ignores a result with no failure info", () => {
    expect(decideTurnRetry({ key: null, attempts: 0 }, { success: false }).action).toBe("idle");
  });
});
