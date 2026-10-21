import { describe, expect, it } from "vitest";
import { nextHeadlineState } from "./worldHeadline";

describe("nextHeadlineState", () => {
  it("opens at three countries, not two", () => {
    expect(nextHeadlineState(false, 2)).toBe(false);
    expect(nextHeadlineState(false, 3)).toBe(true);
  });

  it("stays open until fewer than two countries remain", () => {
    expect(nextHeadlineState(true, 3)).toBe(true);
    expect(nextHeadlineState(true, 2)).toBe(true);
    expect(nextHeadlineState(true, 1)).toBe(false);
    expect(nextHeadlineState(true, 0)).toBe(false);
  });

  it("does not reopen on a single flicker below the opening line", () => {
    expect(nextHeadlineState(false, 2)).toBe(false);
  });
});
