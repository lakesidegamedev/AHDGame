import { describe, expect, it } from "vitest";
import {
  holdUntilMinimumOpen,
  PROPOSAL_MIN_OPEN_MS,
  proposalEarliestPassMs,
  proposalMayPass,
} from "./proposalOpenWindow";

const CREATED = Date.UTC(2026, 0, 10, 3, 9);
const HOUR = 60 * 60 * 1000;

describe("removal vote minimum window", () => {
  it("is 24 hours of real time", () => {
    expect(PROPOSAL_MIN_OPEN_MS).toBe(24 * HOUR);
    expect(proposalEarliestPassMs(CREATED)).toBe(CREATED + 24 * HOUR);
  });

  it("cannot pass one millisecond before the window ends and can at the boundary", () => {
    expect(proposalMayPass(CREATED, CREATED + 24 * HOUR - 1)).toBe(false);
    expect(proposalMayPass(CREATED, CREATED + 24 * HOUR)).toBe(true);
  });

  it("holds a passing outcome open inside the window", () => {
    expect(holdUntilMinimumOpen("passed", CREATED, CREATED + 20 * 60 * 1000)).toBe("open");
    expect(holdUntilMinimumOpen("passed", CREATED, CREATED + 23 * HOUR)).toBe("open");
  });

  it("lets a passing outcome through once the window has ended", () => {
    expect(holdUntilMinimumOpen("passed", CREATED, CREATED + 25 * HOUR)).toBe("passed");
  });

  it("never holds a rejection or an open vote", () => {
    expect(holdUntilMinimumOpen("rejected", CREATED, CREATED + HOUR)).toBe("rejected");
    expect(holdUntilMinimumOpen("open", CREATED, CREATED + HOUR)).toBe("open");
  });
});
