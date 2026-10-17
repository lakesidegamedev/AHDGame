import { describe, expect, it } from "vitest";
import { demandThrottleFactor, DEMAND_THROTTLE_FLOOR } from "./demandThrottle";
import { contributionShare, LOSS_RUN_STEP, LOSS_RUN_STREAK_TURNS, nextLossRun } from "./lossRun";

const pnl = (over: Partial<Parameters<typeof contributionShare>[0] & object> = {}) => ({
  revenue: 100,
  inventoryRevenue: 0,
  inputs: 82,
  labour: 33,
  otherOpex: 9,
  policyCredit: 9,
  ...over,
});

describe("contributionShare", () => {
  it("counts labour above the crew floor as avoidable and upkeep as fixed", () => {
    // 100 - (82 + 9 + 33 x 0.75 - 9) = -6.75
    expect(contributionShare(pnl(), 0.25)).toBeCloseTo(-0.0675, 6);
  });

  it("measures this turn's production, not inventory sell-down", () => {
    expect(contributionShare(pnl({ revenue: 140, inventoryRevenue: 40 }), 0.25)).toBeCloseTo(
      -0.0675,
      6
    );
  });

  it("reads a plant with costs and no sales as a full loss, and no data as unknown", () => {
    expect(contributionShare(pnl({ revenue: 0 }), 0.25)).toBe(-1);
    expect(contributionShare(null, 0.25)).toBeNull();
    expect(contributionShare(pnl({ inputs: Number.NaN }), 0.25)).toBeNull();
  });
});

describe("nextLossRun", () => {
  it("cuts only after six losing turns in a row, five points a turn", () => {
    let state = { share: 1, streak: 0 };
    for (let turn = 1; turn < LOSS_RUN_STREAK_TURNS; turn++) {
      state = nextLossRun({
        contribution: -0.2,
        priorShare: state.share,
        priorStreak: state.streak,
      });
      expect(state.share).toBe(1);
    }
    state = nextLossRun({ contribution: -0.2, priorShare: state.share, priorStreak: state.streak });
    expect(state.share).toBeCloseTo(1 - LOSS_RUN_STEP, 9);
    state = nextLossRun({ contribution: -0.2, priorShare: state.share, priorStreak: state.streak });
    expect(state.share).toBeCloseTo(1 - 2 * LOSS_RUN_STEP, 9);
  });

  it("a turn inside the band resets the streak, so one bad turn never cuts", () => {
    let state = { share: 1, streak: -5 };
    state = nextLossRun({ contribution: 0, priorShare: state.share, priorStreak: state.streak });
    expect(state).toEqual({ share: 1, streak: 0 });
  });

  it("restores after six paying turns and never exceeds a full run", () => {
    let state = { share: 0.5, streak: 0 };
    for (let turn = 0; turn < LOSS_RUN_STREAK_TURNS; turn++) {
      state = nextLossRun({
        contribution: 0.2,
        priorShare: state.share,
        priorStreak: state.streak,
      });
    }
    expect(state.share).toBeCloseTo(0.5 + LOSS_RUN_STEP, 9);
    expect(nextLossRun({ contribution: 0.2, priorShare: 1, priorStreak: 20 }).share).toBe(1);
  });

  it("holds the plant when the P&L cannot answer", () => {
    expect(nextLossRun({ contribution: null, priorShare: 0.7, priorStreak: -8 })).toEqual({
      share: 0.7,
      streak: -8,
    });
    expect(
      nextLossRun({ contribution: null, priorShare: undefined, priorStreak: undefined })
    ).toEqual({ share: 1, streak: 0 });
  });
});

describe("demandThrottleFactor with a loss run share", () => {
  it("is unchanged at a full share", () => {
    expect(demandThrottleFactor(1000, 1000, 1000, 0, 0, 1)).toBe(
      demandThrottleFactor(1000, 1000, 1000, 0, 0)
    );
    expect(demandThrottleFactor(1000, 500, 800, 0, 0, 1)).toBe(
      demandThrottleFactor(1000, 500, 800, 0, 0)
    );
  });

  it("scales a plant that sells everything back by its share", () => {
    expect(demandThrottleFactor(1000, 1000, 1000, 0, 0, 0.6)).toBeCloseTo(0.6, 9);
  });

  it("never cuts a named buyer's contract and keeps the probe floor", () => {
    expect(demandThrottleFactor(1000, 1000, 1000, 800, 0, 0.3)).toBeCloseTo(0.8, 9);
    expect(demandThrottleFactor(1000, 1000, 1000, 0, 0, 0)).toBe(DEMAND_THROTTLE_FLOOR);
  });

  it("applies the share to a plant with no sales history", () => {
    expect(demandThrottleFactor(1000, null, null, 0, 0, 0.5)).toBe(0.5);
    expect(demandThrottleFactor(1000, null, null, 0, 0, 1)).toBe(1);
  });
});
