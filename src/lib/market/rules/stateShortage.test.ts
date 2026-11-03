import { describe, expect, it } from "vitest";
import { stateShortage } from "./stateShortage";

describe("stateShortage", () => {
  it("counts the states whose own book is short, not the world total", () => {
    // World: supply 160, demand 300, deeply short. Only one state is.
    const supply = { A: 100, B: 50, C: 10 };
    const demand = { A: 90, B: 50, C: 160 };
    expect(stateShortage(supply, demand)).toEqual({ shortStates: 1, tradingStates: 3 });
  });

  it("reads a state just inside the 95% band as supplied", () => {
    expect(stateShortage({ A: 96 }, { A: 100 })).toEqual({ shortStates: 0, tradingStates: 1 });
    expect(stateShortage({ A: 94 }, { A: 100 })).toEqual({ shortStates: 1, tradingStates: 1 });
  });

  it("counts a state with demand and no supply as short", () => {
    expect(stateShortage({}, { A: 10 })).toEqual({ shortStates: 1, tradingStates: 1 });
  });

  it("ignores states with no trade and bad numbers", () => {
    expect(stateShortage({ A: 0, B: Number.NaN, C: 5 }, { A: 0, B: -3, C: 5 })).toEqual({
      shortStates: 0,
      tradingStates: 1,
    });
  });

  it("only counts the states the filter keeps", () => {
    const supply = { US_CA: 0, JP_KAN: 0 };
    const demand = { US_CA: 10, JP_KAN: 10 };
    expect(stateShortage(supply, demand, (id) => id.startsWith("US"))).toEqual({
      shortStates: 1,
      tradingStates: 1,
    });
  });
});
