import { describe, expect, it } from "vitest";
import { dominanceCostPct, monopolyChargePct } from "./dominanceCharges";

describe("monopolyChargePct", () => {
  it("adds the state and country parts", () => {
    const both = monopolyChargePct({
      localSharePct: 100,
      nationalSharePct: 50,
      shield: 0,
      stateOwned: false,
    });
    const stateOnly = monopolyChargePct({
      localSharePct: 100,
      nationalSharePct: 0,
      shield: 0,
      stateOwned: false,
    });
    const countryOnly = monopolyChargePct({
      localSharePct: 0,
      nationalSharePct: 50,
      shield: 0,
      stateOwned: false,
    });
    expect(stateOnly).toBeCloseTo(3.75, 5);
    expect(countryOnly).toBeCloseTo((20 / 70) * 3.75, 8);
    expect(both).toBeCloseTo(stateOnly + countryOnly, 8);
  });
  it("is zero below the thresholds and for state-owned companies", () => {
    expect(
      monopolyChargePct({ localSharePct: 50, nationalSharePct: 30, shield: 0, stateOwned: false })
    ).toBe(0);
    expect(
      monopolyChargePct({ localSharePct: 100, nationalSharePct: 100, shield: 0, stateOwned: true })
    ).toBe(0);
  });
  it("is cut by the shield", () => {
    expect(
      monopolyChargePct({ localSharePct: 100, nationalSharePct: 0, shield: 0.5, stateOwned: false })
    ).toBeCloseTo(1.875, 5);
  });
});

describe("dominanceCostPct", () => {
  it("runs in a straight line from 0 at 50% to 3.75 at 100% of the state", () => {
    expect(dominanceCostPct({ localSharePct: 50, shield: 0, stateOwned: false })).toBe(0);
    expect(dominanceCostPct({ localSharePct: 100, shield: 0, stateOwned: false })).toBeCloseTo(
      3.75,
      5
    );
    expect(dominanceCostPct({ localSharePct: 75, shield: 0, stateOwned: false })).toBeCloseTo(
      1.875,
      8
    );
  });
  it("ignores the country share and state-owned companies", () => {
    expect(dominanceCostPct({ localSharePct: 40, shield: 0, stateOwned: false })).toBe(0);
    expect(dominanceCostPct({ localSharePct: 100, shield: 0, stateOwned: true })).toBe(0);
  });
});
