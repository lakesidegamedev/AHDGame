import { describe, expect, it } from "vitest";
import { resolveResumeIndex } from "./coachSteps";

const steps = [{ id: "welcome" }, { id: "join-party" }, { id: "action-campaign" }];

describe("resolveResumeIndex", () => {
  it("lands on the saved step by id", () => {
    expect(resolveResumeIndex(steps, "action-campaign")).toBe(2);
  });

  it("falls back to the first step when the saved id no longer exists", () => {
    expect(resolveResumeIndex(steps, "removed-step")).toBe(0);
  });
});
