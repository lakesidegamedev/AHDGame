import { describe, expect, it } from "vitest";
import { isWithinOnboardingWindow } from "./stepStamps";

const DAY = 86_400_000;

describe("isWithinOnboardingWindow", () => {
  const now = Date.parse("2026-11-23T12:00:00Z");

  it("keeps a recent character in onboarding", () => {
    expect(isWithinOnboardingWindow({ createdAt: new Date(now - 5 * DAY) }, now)).toBe(true);
  });

  it("ends onboarding for a character from May", () => {
    expect(isWithinOnboardingWindow({ createdAt: new Date("2026-05-22T00:00:00Z") }, now)).toBe(
      false
    );
  });
});
