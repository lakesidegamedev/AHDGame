import { describe, expect, it } from "vitest";
import { noConfidenceTargetStillInOffice as matches } from "./noConfidenceTarget";
describe("confidence motion actor identity", () => {
  it("supports legacy player and NPC targets without mixing actor kinds", () => {
    expect(matches({ status: "formed", pmCharacterId: "a" }, { targetPmCharacterId: "a" })).toBe(
      true
    );
    expect(matches({ status: "formed", pmNppId: "a" }, { targetPmNppId: "a" })).toBe(true);
    expect(matches({ status: "formed", pmNppId: "a" }, { targetPmCharacterId: "a" })).toBe(false);
    expect(matches({ status: "formed", pmNppId: "b" }, { targetPmNppId: "a" })).toBe(false);
    expect(matches({ status: "pending", pmNppId: "a" }, { targetPmNppId: "a" })).toBe(false);
    expect(
      matches({ status: "formed", pmNppId: "a" }, { targetPmNppId: "a", targetPmCharacterId: "a" })
    ).toBe(false);
  });
});
