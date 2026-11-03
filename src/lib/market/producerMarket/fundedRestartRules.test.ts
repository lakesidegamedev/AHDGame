import { describe, expect, it } from "vitest";
import {
  FUNDED_RESTART_PRESSURE,
  chooseFundedRestart,
  fundedRecipePressure,
  recipeKey,
  recipePressure,
} from "./fundedRestartRules";
import { laneKeyOf } from "./laneKey";

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

  it("reopens one fully mothballed recipe whose own book shows unmet demand", () => {
    const pressureByBook = new Map([[laneKeyOf("food", "country:US"), 2]]);
    const p = fundedRecipePressure({
      running: [],
      mothballed: [
        { sectorType: "agriculture", products: [{ commodity: "food", book: "country:US" }] },
      ],
      pressureByBook,
    });
    const of = (t: string, s: string | null | undefined) => p[recipeKey(t, s)];
    expect(of("agriculture", undefined)).toBe(2);
    // One restart per company even with two cold plants of the recipe.
    expect(
      chooseFundedRestart([sector("a", "agriculture"), sector("b", "agriculture")], of)?._id
    ).toBe("a");
  });

  it("treats any unmet demand in a cold recipe as pressure for one restart", () => {
    const p = fundedRecipePressure({
      running: [],
      mothballed: [
        { sectorType: "agriculture", products: [{ commodity: "food", book: "country:US" }] },
      ],
      pressureByBook: new Map([[laneKeyOf("food", "country:US"), 1.2]]),
    });
    const of = (t: string, s: string | null | undefined) => p[recipeKey(t, s)];
    expect(of("agriculture", undefined)).toBe(FUNDED_RESTART_PRESSURE);
    expect(chooseFundedRestart([sector("d", "agriculture")], of)?._id).toBe("d");
  });

  it("leaves a fully mothballed recipe cold without unmet demand", () => {
    const mothballed = [
      {
        sectorType: "agriculture",
        products: [{ commodity: "food", book: "country:US" }],
      },
    ];
    const served = fundedRecipePressure({
      running: [],
      mothballed,
      pressureByBook: new Map([[laneKeyOf("food", "country:US"), 1]]),
    });
    const of = (t: string, s: string | null | undefined) => served[recipeKey(t, s)];
    expect(chooseFundedRestart([sector("d", "agriculture")], of)).toBeNull();
    const unasked = fundedRecipePressure({
      running: [],
      mothballed,
      pressureByBook: new Map(),
    });
    expect(unasked[recipeKey("agriculture", undefined)]).toBeUndefined();
  });

  it("keeps a running plant's delivered-weighted reading for its recipe", () => {
    const p = fundedRecipePressure({
      running: [{ sectorType: "agriculture", pressure: 1.6, deliveredUnits: 10 }],
      mothballed: [
        { sectorType: "agriculture", products: [{ commodity: "food", book: "country:US" }] },
        { sectorType: "energy", products: [{ commodity: "power", book: "world" }] },
      ],
      pressureByBook: new Map([
        [laneKeyOf("food", "country:US"), 2],
        [laneKeyOf("power", "world"), 2],
      ]),
    });
    expect(p[recipeKey("agriculture", undefined)]).toBeCloseTo(1.6, 12);
    expect(p[recipeKey("energy", undefined)]).toBe(2);
  });
});
