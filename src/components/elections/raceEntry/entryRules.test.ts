import { describe, expect, it } from "vitest";
import { canEnter, canWithdraw } from "./entryRules";

const race = {
  inPrimary: true,
  isEnded: false,
  myCharId: "c1",
  viewerWithdrew: false,
};

describe("entryRules", () => {
  it("offers Enter only in the primary to someone not in it", () => {
    expect(canEnter(race, false)).toBe(true);
    expect(canEnter(race, true)).toBe(false);
    expect(canEnter({ ...race, inPrimary: false }, false)).toBe(false);
    expect(canEnter({ ...race, myCharId: null }, false)).toBe(false);
    expect(canEnter({ ...race, isEnded: true }, false)).toBe(false);
  });

  it("never offers Enter after a withdrawal", () => {
    expect(canEnter({ ...race, viewerWithdrew: true }, false)).toBe(false);
  });

  it("offers Withdraw until the race ends", () => {
    expect(canWithdraw(race, true)).toBe(true);
    expect(canWithdraw({ ...race, inPrimary: false }, true)).toBe(true);
    expect(canWithdraw({ ...race, isEnded: true }, true)).toBe(false);
    expect(canWithdraw(race, false)).toBe(false);
  });
});
