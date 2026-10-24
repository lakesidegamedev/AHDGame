import { describe, expect, it } from "vitest";
import {
  FUNDED_RESTART_PRESSURE,
  chooseFundedRestart,
  recipeKey,
  recipePressure,
} from "./fundedRestartRules";

const sector = (id: string, sectorType: string, mothballed = true, strategyId?: string) => ({
  _id: id,
  sectorType,
  strategyId,
  mothballed,
});

describe("funded restart", () => {
  it("weights each recipe's shortage by what its running plants delivered", () => {
    const p = recipePressure([
      { sectorType: "agriculture", pressure: 2, deliveredUnits: 30 },
      { sectorType: "agriculture", pressure: 1, deliveredUnits: 10 },
      { sectorType: "media", pressure: 1, deliveredUnits: 0 },
      { sectorType: "energy", strategyId: "gas", deliveredUnits: 5 },
    ]);
    expect(p[recipeKey("agriculture", undefined)]).toBeCloseTo(1.75, 12);
    expect(p[recipeKey("media", undefined)]).toBeUndefined();
    expect(p[recipeKey("energy", "gas")]).toBeUndefined();
  });

  it("reopens only a mothballed plant whose recipe is short enough, deepest first", () => {
    const pressure = new Map([
      [recipeKey("agriculture", undefined), 2],
      [recipeKey("energy", undefined), 1.6],
      [recipeKey("media", undefined), 1],
    ]);
    const of = (t: string, s: string | null | undefined) => pressure.get(recipeKey(t, s));
    const pick = chooseFundedRestart(
      [
        sector("a", "media"),
        sector("b", "energy"),
        sector("c", "agriculture", false),
        sector("d", "agriculture"),
      ],
      of
    );
    expect(pick?._id).toBe("d");
    expect(chooseFundedRestart([sector("a", "media")], of)).toBeNull();
    expect(chooseFundedRestart([sector("d", "agriculture")], of, () => false)).toBeNull();
    expect(FUNDED_RESTART_PRESSURE).toBeGreaterThan(1);
  });
});
