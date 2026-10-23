import { describe, expect, it } from "vitest";
import {
  classifySector,
  freeTransitionConversion,
  inTransitionWindow,
  landingWeight,
  shadowTurnSettled,
  TRANSITION_WINDOW_TURNS,
  transitionSupport,
} from "./transitionRules";

const samples = (legacy: number, funded: number, n = 5) =>
  Array.from({ length: n }, () => ({ legacy, funded }));

describe("transition classification", () => {
  it("marks a sector over-built when funded revenue is under 60% of legacy", () => {
    expect(classifySector(samples(100, 59)).mismatched).toBe(true);
    expect(classifySector(samples(100, 60)).mismatched).toBe(false);
  });

  it("uses only the last five turns and records how many it had", () => {
    const s = [...samples(100, 0, 3), ...samples(100, 90, 5)];
    expect(classifySector(s)).toMatchObject({
      mismatched: false,
      basisTurns: 5,
      fundedRevenueAnchor: 90,
    });
    expect(classifySector(samples(100, 10, 2)).basisTurns).toBe(2);
  });

  it("never marks a sector with no legacy revenue", () => {
    expect(classifySector(samples(0, 0)).mismatched).toBe(false);
    expect(classifySector([]).basisTurns).toBe(0);
  });
});

describe("transition window", () => {
  it("runs the full window and fades from 1 to 0", () => {
    expect(inTransitionWindow(99, 100)).toBe(false);
    expect(landingWeight(100, 100)).toBe(1);
    expect(landingWeight(100 + TRANSITION_WINDOW_TURNS / 2, 100)).toBeCloseTo(0.5);
    expect(inTransitionWindow(100 + TRANSITION_WINDOW_TURNS - 1, 100)).toBe(true);
    expect(landingWeight(100 + TRANSITION_WINDOW_TURNS, 100)).toBe(0);
  });
});

describe("transition support", () => {
  const mismatched = classifySector(samples(100, 20));
  const base = {
    // Halfway through the window, so the support has faded to half.
    turn: 100 + TRANSITION_WINDOW_TURNS / 2,
    firstFundedTurn: 100,
    sectors: [
      {
        sectorId: "a",
        countryId: "US",
        transition: mismatched,
        settledRevenue: 20,
        mothballed: false,
        converted: false,
      },
      {
        sectorId: "b",
        countryId: "US",
        transition: mismatched,
        settledRevenue: 60,
        mothballed: false,
        converted: false,
      },
      {
        sectorId: "c",
        countryId: "US",
        transition: mismatched,
        settledRevenue: 0,
        mothballed: true,
        converted: false,
      },
      {
        sectorId: "d",
        countryId: "US",
        transition: mismatched,
        settledRevenue: 0,
        mothballed: false,
        converted: true,
      },
      {
        sectorId: "e",
        countryId: "GB",
        transition: classifySector(samples(100, 90)),
        settledRevenue: 10,
        mothballed: false,
        converted: false,
      },
    ],
  };

  it("pays the faded gap in full when the pool covers it", () => {
    const { payments, coverageByCountry } = transitionSupport({
      ...base,
      poolByCountry: new Map([["US", 1000]]),
    });
    expect(payments).toEqual([
      { sectorId: "a", countryId: "US", claim: 40 },
      { sectorId: "b", countryId: "US", claim: 20 },
    ]);
    expect(coverageByCountry.get("US")).toBe(1);
  });

  it("never pays more than the country's unspent public funding", () => {
    const { payments, coverageByCountry } = transitionSupport({
      ...base,
      poolByCountry: new Map([["US", 30]]),
    });
    expect(payments.reduce((s, p) => s + p.claim, 0)).toBeCloseTo(30);
    expect(coverageByCountry.get("US")).toBeCloseTo(0.5);
    expect(transitionSupport({ ...base, poolByCountry: new Map() }).payments).toEqual([]);
  });

  it("pays nothing outside the window", () => {
    expect(
      transitionSupport({
        ...base,
        turn: 100 + TRANSITION_WINDOW_TURNS + 6,
        poolByCountry: new Map([["US", 1000]]),
      }).payments
    ).toEqual([]);
  });
});

describe("settled shadow turns for classification", () => {
  it("skips a run's cushion turns and unparseable run ids", () => {
    expect(shadowTurnSettled("w:r322", 322, 3)).toBe(false);
    expect(shadowTurnSettled("w:r322", 324, 3)).toBe(false);
    expect(shadowTurnSettled("w:r322", 325, 3)).toBe(true);
    expect(shadowTurnSettled(undefined, 400, 3)).toBe(false);
    expect(shadowTurnSettled("w:live", 400, 3)).toBe(false);
  });
});

describe("support never overdraws the pool", () => {
  it("pays a fully claimed pool without exceeding it under float error", () => {
    const sectors = Array.from({ length: 997 }, (_, i) => ({
      sectorId: `s${String(i).padStart(4, "0")}`,
      countryId: "BG",
      transition: {
        mismatched: true,
        legacyRevenueAnchor: 1 + i * 0.7319,
        fundedRevenueAnchor: 0,
        basisTurns: 5,
      },
      settledRevenue: 0.1,
      mothballed: false,
      converted: false,
    }));
    const pool = 15.798931;
    const { payments } = transitionSupport({
      turn: 10,
      firstFundedTurn: 10,
      sectors,
      poolByCountry: new Map([["BG", pool]]),
    });
    let left = pool * 28.025652481726606;
    for (const p of payments) left -= p.claim * 28.025652481726606;
    expect(left).toBeGreaterThanOrEqual(0);
  });
});

describe("free transition conversion", () => {
  const mismatched = {
    mismatched: true,
    legacyRevenueAnchor: 9,
    fundedRevenueAnchor: 1,
    basisTurns: 5,
  };
  it("is open once for a mismatched sector inside the window", () => {
    expect(freeTransitionConversion({ cutoverTransition: mismatched }, 11, 11)).toBe(true);
    expect(
      freeTransitionConversion(
        { cutoverTransition: mismatched },
        11 + TRANSITION_WINDOW_TURNS - 1,
        11
      )
    ).toBe(true);
  });
  it("is closed outside the window, after use, for matched sectors and before any opening", () => {
    expect(
      freeTransitionConversion({ cutoverTransition: mismatched }, 11 + TRANSITION_WINDOW_TURNS, 11)
    ).toBe(false);
    expect(freeTransitionConversion({ cutoverTransition: mismatched }, 10, 11)).toBe(false);
    expect(
      freeTransitionConversion(
        { cutoverTransition: mismatched, cutoverConvertedAtTurn: 12 },
        13,
        11
      )
    ).toBe(false);
    expect(
      freeTransitionConversion({ cutoverTransition: { ...mismatched, mismatched: false } }, 12, 11)
    ).toBe(false);
    expect(freeTransitionConversion({ cutoverTransition: mismatched }, 12, undefined)).toBe(false);
  });
});
