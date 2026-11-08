import { describe, expect, it } from "vitest";
import { buildCrisisBlameModifierByParty } from "./crisisBlame";

const shift = (partyId: string, pct: number, regionIds: string[] = [], expiresAtTurn = 100) => ({
  partyId,
  pct,
  regionIds,
  expiresAtTurn,
});
const race = new Set(["a", "b"]);

describe("buildCrisisBlameModifierByParty", () => {
  it("turns a party's shift into a nominal-share multiplier", () => {
    const map = buildCrisisBlameModifierByParty([shift("a", -2), shift("b", 1)], "TX", race, 10);
    expect(map.get("a")).toBeCloseTo(0.98);
    expect(map.get("b")).toBeCloseTo(1.01);
  });

  it("ignores expired shifts and parties outside the race", () => {
    const map = buildCrisisBlameModifierByParty(
      [shift("a", -2, [], 10), shift("z", 2)],
      "TX",
      race,
      10
    );
    expect(map.size).toBe(0);
  });

  it("applies regional shifts only in races held in those regions", () => {
    const shifts = [shift("a", -2, ["tx"])];
    expect(buildCrisisBlameModifierByParty(shifts, "TX", race, 1).get("a")).toBeCloseTo(0.98);
    expect(buildCrisisBlameModifierByParty(shifts, "OH", race, 1).size).toBe(0);
    expect(buildCrisisBlameModifierByParty(shifts, undefined, race, 1).size).toBe(0);
  });

  it("bounds the total for a party hit by several crises", () => {
    const map = buildCrisisBlameModifierByParty(
      [shift("a", -3), shift("a", -3), shift("a", -3)],
      "TX",
      race,
      1
    );
    expect(map.get("a")).toBeCloseTo(0.97);
  });
});
