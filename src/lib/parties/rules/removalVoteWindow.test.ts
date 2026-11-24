import { describe, expect, it } from "vitest";
import {
  holdRemovalUntilWindow,
  REMOVAL_VOTE_MIN_OPEN_MS,
  removalVoteEarliestPassMs,
  removalVoteMayPass,
} from "./removalVoteWindow";

const CREATED = Date.UTC(2026, 0, 10, 3, 9);
const HOUR = 60 * 60 * 1000;

describe("removal vote minimum window", () => {
  it("is 24 hours of real time", () => {
    expect(REMOVAL_VOTE_MIN_OPEN_MS).toBe(24 * HOUR);
    expect(removalVoteEarliestPassMs(CREATED)).toBe(CREATED + 24 * HOUR);
  });

  it("cannot pass one millisecond before the window ends and can at the boundary", () => {
    expect(removalVoteMayPass(CREATED, CREATED + 24 * HOUR - 1)).toBe(false);
    expect(removalVoteMayPass(CREATED, CREATED + 24 * HOUR)).toBe(true);
  });

  it("holds a passing outcome open inside the window", () => {
    expect(holdRemovalUntilWindow("passed", CREATED, CREATED + 20 * 60 * 1000)).toBe("open");
    expect(holdRemovalUntilWindow("passed", CREATED, CREATED + 23 * HOUR)).toBe("open");
  });

  it("lets a passing outcome through once the window has ended", () => {
    expect(holdRemovalUntilWindow("passed", CREATED, CREATED + 25 * HOUR)).toBe("passed");
  });

  it("never holds a rejection or an open vote", () => {
    expect(holdRemovalUntilWindow("rejected", CREATED, CREATED + HOUR)).toBe("rejected");
    expect(holdRemovalUntilWindow("open", CREATED, CREATED + HOUR)).toBe("open");
  });
});
