import { describe, expect, it } from "vitest";
import {
  advanceProducerCapacity,
  PRODUCER_CATCH_UP_TURNS,
  type ProducerCapacityState,
} from "./capacityRules";
import { CAPITAL_DEPRECIATION_PER_TURN } from "@/lib/market/capital";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";

const advance = (state: ProducerCapacityState, activeFraction = 1, operatingRecipeRatio = 1) =>
  advanceProducerCapacity({
    state,
    turn: state.completedTurn + 1,
    activeFraction,
    operatingRecipeRatio,
    recessionCapacityFactor: 1,
  });

describe("owned producer capacity", () => {
  it("preserves accelerated fractional schedules and secured claims without resetting delivery", () => {
    const order = {
      unitsOrdered: 100,
      costPaidAnchor: 50,
      startTurn: 0.5,
      onlineTurn: 3,
      smooth: true,
      constructionLoanId: "loan",
      constructionClaimId: "claim",
    };
    const next = advance({
      completedTurn: 1,
      ownedDailyUnits: 20,
      paidBookAnchor: 10,
      buildQueue: [order],
    });
    expect(next.deliveredDailyUnits).toBeCloseTo(40, 12);
    expect(next.deliveredPaidCostAnchor).toBeCloseTo(20, 12);
    expect(next.constructionInProgressAnchor).toBeCloseTo(20, 12);
    expect(next.state.buildQueue).toEqual([order]);
    expect(
      next.state.paidBookAnchor + next.constructionInProgressAnchor + next.depreciationAnchor
    ).toBeCloseTo(50, 12);
    const last = advance(next.state);
    expect(last.deliveredDailyUnits).toBeCloseTo(40, 12);
    expect(last.state.buildQueue).toEqual([]);
  });

  it("conserves paid construction across gradual deliveries and depreciation", () => {
    let state: ProducerCapacityState = {
      completedTurn: 10,
      ownedDailyUnits: 0,
      paidBookAnchor: 0,
      buildQueue: [
        { unitsOrdered: 240, costPaidAnchor: 480, startTurn: 10, onlineTurn: 14, smooth: true },
      ],
    };
    let depreciation = 0;
    let delivered = 0;
    for (let turn = 11; turn <= 14; turn++) {
      const next = advance(state);
      depreciation += next.depreciationAnchor;
      delivered += next.deliveredDailyUnits;
      expect(next.state.paidBookAnchor / next.state.ownedDailyUnits).toBeCloseTo(2, 12);
      expect(
        next.state.paidBookAnchor + next.constructionInProgressAnchor + depreciation
      ).toBeCloseTo(480, 10);
      expect(next.capacityUnits * TURNS_PER_DAY).toBe(next.state.ownedDailyUnits);
      state = next.state;
    }
    expect(delivered).toBe(240);
    expect(state.buildQueue).toEqual([]);
    expect(advance(state).deliveredDailyUnits).toBe(0);
  });

  it("parks output without deleting stock, and applies retool ratios only to operation", () => {
    const opening = { completedTurn: 2, ownedDailyUnits: 240, paidBookAnchor: 100, buildQueue: [] };
    const active = advance(opening, 1, 3);
    const parked = advance(opening, 0, 3);
    expect(parked.state).toEqual(active.state);
    expect(parked.activeUnits).toBe(0);
    expect(active.state.ownedDailyUnits).toBe(240 * (1 - CAPITAL_DEPRECIATION_PER_TURN));
    expect(active.capacityUnits).toBeCloseTo((active.state.ownedDailyUnits * 3) / TURNS_PER_DAY);
  });

  it("delivers a scheduled single tranche once and retains its actual paid basis", () => {
    const next = advance({
      completedTurn: 6,
      ownedDailyUnits: 100,
      paidBookAnchor: 50,
      buildQueue: [{ unitsOrdered: 80, costPaidAnchor: 10, startTurn: 3, onlineTurn: 7 }],
    });
    expect(next.deliveredDailyUnits).toBe(80);
    expect(next.state.paidBookAnchor).toBeCloseTo(60 * (1 - CAPITAL_DEPRECIATION_PER_TURN));
    expect(advance(next.state).deliveredDailyUnits).toBe(0);
  });

  it("refuses replay, long gaps, phantom basis and already-delivered orders", () => {
    const state = { completedTurn: 3, ownedDailyUnits: 0, paidBookAnchor: 0, buildQueue: [] };
    for (const turn of [2, 3, 3 + PRODUCER_CATCH_UP_TURNS + 2])
      expect(() =>
        advanceProducerCapacity({
          state,
          turn,
          activeFraction: 1,
          operatingRecipeRatio: 1,
          recessionCapacityFactor: 1,
        })
      ).toThrow("next unsettled turn");
    expect(() => advance({ ...state, paidBookAnchor: 1 })).toThrow("reconciliation");
    expect(() =>
      advance({
        ...state,
        buildQueue: [{ unitsOrdered: 1, costPaidAnchor: 1, startTurn: 1, onlineTurn: 3 }],
      })
    ).toThrow("schedule");
  });

  it("catches up missed turns without stranding paid construction", () => {
    // Turn 561 never settled: the plant opens at 560 and closes 562.
    const opening: ProducerCapacityState = {
      completedTurn: 560,
      ownedDailyUnits: 100,
      paidBookAnchor: 50,
      buildQueue: [
        // Lands in the missed turn: dropping it would lose its paid cost.
        { unitsOrdered: 30, costPaidAnchor: 12, startTurn: 555, onlineTurn: 561 },
        { unitsOrdered: 60, costPaidAnchor: 24, startTurn: 558, onlineTurn: 564, smooth: true },
        // Placed while the turn was missed.
        { unitsOrdered: 40, costPaidAnchor: 8, startTurn: 561, onlineTurn: 565, smooth: true },
      ],
    };
    const next = advanceProducerCapacity({
      state: opening,
      turn: 562,
      activeFraction: 1,
      operatingRecipeRatio: 1,
      recessionCapacityFactor: 1,
    });
    expect(next.state.completedTurn).toBe(562);
    expect(next.deliveredDailyUnits).toBeCloseTo(30 + 60 * (2 / 6) + 40 * (1 / 4), 10);
    expect(next.deliveredPaidCostAnchor).toBeCloseTo(12 + 24 * (2 / 6) + 8 * (1 / 4), 10);
    const retention = (1 - CAPITAL_DEPRECIATION_PER_TURN) ** 2;
    expect(next.state.ownedDailyUnits).toBeCloseTo((100 + next.deliveredDailyUnits) * retention);
    expect(next.state.buildQueue.map((o) => o.onlineTurn)).toEqual([564, 565]);
    // Every paid anchor is in the book, still under construction, or depreciated
    // (a third of the smooth order was already in the opening book).
    expect(
      next.state.paidBookAnchor + next.constructionInProgressAnchor + next.depreciationAnchor
    ).toBeCloseTo(50 + 12 + 24 * (4 / 6) + 8, 10);
    // The next turn is ordinary again.
    expect(advance(next.state).state.completedTurn).toBe(563);
  });

  it("still refuses an order started after the previous turn when catching up", () => {
    expect(() =>
      advanceProducerCapacity({
        state: {
          completedTurn: 560,
          ownedDailyUnits: 0,
          paidBookAnchor: 0,
          buildQueue: [{ unitsOrdered: 1, costPaidAnchor: 1, startTurn: 562, onlineTurn: 570 }],
        },
        turn: 562,
        activeFraction: 1,
        operatingRecipeRatio: 1,
        recessionCapacityFactor: 1,
      })
    ).toThrow("schedule");
  });
});
