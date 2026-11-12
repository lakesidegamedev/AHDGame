import { describe, expect, it } from "vitest";
import {
  advanceNationalIndex,
  initialNationalIndex,
  markNationalIndexFund,
  NATIONAL_INDEX_EARNINGS_YIELD,
  nationalIndexFundIdentity,
  nationalIndexNav,
} from "./nationalIndex";

const TPY = 48;

describe("national index level", () => {
  it("tracks output and earns its yield over a year", () => {
    let state = initialNationalIndex(1_000, 0);
    for (let turn = 6; turn <= TPY; turn += 6) {
      state = advanceNationalIndex(state, {
        output: 1_000 * 1.02 ** (turn / TPY),
        turn,
        turnsPerYear: TPY,
        stability: 1,
        exportFill: null,
      });
    }
    expect(state.level).toBeCloseTo(1.02 * (1 + NATIONAL_INDEX_EARNINGS_YIELD), 6);
  });

  it("falls with output and with unsold exports", () => {
    const start = initialNationalIndex(1_000, 0);
    const recession = advanceNationalIndex(start, {
      output: 950,
      turn: 6,
      turnsPerYear: TPY,
      stability: 0.5,
      exportFill: 0.5,
    });
    const sold = advanceNationalIndex(start, {
      output: 950,
      turn: 6,
      turnsPerYear: TPY,
      stability: 0.5,
      exportFill: 1,
    });
    expect(recession.level).toBeLessThan(0.96);
    expect(sold.level).toBeGreaterThan(recession.level);
  });

  it("does nothing on a repeated turn", () => {
    const state = initialNationalIndex(1_000, 6);
    expect(
      advanceNationalIndex(state, {
        output: 2_000,
        turn: 6,
        turnsPerYear: TPY,
        stability: 1,
        exportFill: null,
      })
    ).toBe(state);
  });
});

describe("national index fund mark", () => {
  it("moves cash by the NAV change on every unit, queued units included", () => {
    expect(
      markNationalIndexFund({
        quotedNav: 100,
        newNav: 103,
        unitSupply: 10,
        queuedUnits: 2,
        cashAnchor: 1_200,
      })
    ).toEqual({ cashDelta: 36, cashAnchor: 1_236 });
  });

  it("never takes cash below zero", () => {
    expect(
      markNationalIndexFund({
        quotedNav: 100,
        newNav: 50,
        unitSupply: 10,
        queuedUnits: 0,
        cashAnchor: 200,
      })
    ).toEqual({ cashDelta: -200, cashAnchor: 0 });
  });

  it("names the fund after the country", () => {
    expect(nationalIndexFundIdentity("SE", "Sweden")).toEqual({
      slug: "se_national",
      name: "Sweden National Index",
      tickerSymbol: "SENX",
    });
    expect(nationalIndexNav(1.5)).toBe(150);
  });
});
