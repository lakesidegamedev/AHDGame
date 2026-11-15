import { describe, expect, it } from "vitest";
import {
  MACRO_HISTORY_DEFAULT_TURNS,
  MACRO_HISTORY_MAX_TURNS,
  MACRO_HISTORY_MIN_TURNS,
  buildNationalMacroSeries,
  downsampleSeries,
  normalizeHistoryTurns,
  seriesChangePercent,
} from "./macroHistory";

describe("buildNationalMacroSeries", () => {
  it("joins GDP and population by turn and derives per capita", () => {
    const points = buildNationalMacroSeries({
      gdp: [
        { turn: 10, year: 1991, value: 2_000_000 },
        { turn: 11, year: 1991, value: 2_100_000 },
      ],
      population: [
        { turn: 11, value: 100_000_000 },
        { turn: 10, value: 99_000_000 },
      ],
    });

    expect(points).toHaveLength(2);
    expect(points[0].turn).toBe(10);
    expect(points[0].gdpPerCapita).toBeCloseTo((2_000_000 * 1_000_000) / 99_000_000, 6);
    expect(points[1].gdpPerCapita).toBeCloseTo((2_100_000 * 1_000_000) / 100_000_000, 6);
  });

  it("never invents population or per capita when a turn is missing them", () => {
    const points = buildNationalMacroSeries({
      gdp: [{ turn: 5, value: 900_000 }],
      population: [{ turn: 4, value: 10_000_000 }],
    });
    expect(points).toHaveLength(1);
    expect(points[0].population).toBeNull();
    expect(points[0].gdpPerCapita).toBeNull();
  });

  it("drops per capita instead of dividing by a zero or missing population", () => {
    const points = buildNationalMacroSeries({
      gdp: [
        { turn: 1, value: 500 },
        { turn: 2, value: 600 },
      ],
      population: [{ turn: 1, value: 0 }],
    });
    expect(points.map((point) => point.population)).toEqual([null, null]);
    expect(points.map((point) => point.gdpPerCapita)).toEqual([null, null]);
  });

  it("skips non-finite and negative GDP samples instead of flattening them to zero", () => {
    const points = buildNationalMacroSeries({
      gdp: [
        { turn: 1, value: 100 },
        { turn: 2, value: Number.NaN },
        { turn: 3, value: -5 },
        { turn: 4, value: 200 },
      ],
      population: [],
    });
    expect(points.map((point) => point.turn)).toEqual([1, 4]);
  });

  it("sorts by turn regardless of input order", () => {
    const points = buildNationalMacroSeries({
      gdp: [
        { turn: 3, value: 300 },
        { turn: 1, value: 100 },
        { turn: 2, value: 200 },
      ],
      population: [],
    });
    expect(points.map((point) => point.turn)).toEqual([1, 2, 3]);
  });
});

describe("downsampleSeries", () => {
  it("returns every point when the series already fits", () => {
    const points = [{ turn: 1 }, { turn: 2 }];
    expect(downsampleSeries(points, 10)).toEqual(points);
  });

  it("thins evenly and always keeps the newest turn", () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({ turn: index + 1 }));
    const thinned = downsampleSeries(points, 10);
    expect(thinned).toHaveLength(10);
    expect(thinned[0].turn).toBe(1);
    expect(thinned.at(-1)?.turn).toBe(1000);
  });
});

describe("normalizeHistoryTurns", () => {
  it("defaults on missing or non-finite input", () => {
    expect(normalizeHistoryTurns(null)).toBe(MACRO_HISTORY_DEFAULT_TURNS);
    expect(normalizeHistoryTurns(Number.NaN)).toBe(MACRO_HISTORY_DEFAULT_TURNS);
  });

  it("clamps to the supported window", () => {
    expect(normalizeHistoryTurns(1)).toBe(MACRO_HISTORY_MIN_TURNS);
    expect(normalizeHistoryTurns(10_000)).toBe(MACRO_HISTORY_MAX_TURNS);
    expect(normalizeHistoryTurns(48.4)).toBe(48);
  });
});

describe("seriesChangePercent", () => {
  it("measures first to last finite value", () => {
    expect(seriesChangePercent([100, null, 110])).toBeCloseTo(10, 6);
  });

  it("returns null without two values or a usable base", () => {
    expect(seriesChangePercent([100])).toBeNull();
    expect(seriesChangePercent([0, 10])).toBeNull();
  });
});
