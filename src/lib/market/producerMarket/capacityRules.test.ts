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

  it("keeps a current-turn paid order intact until delivery begins", () => {
    const order = {
      unitsOrdered: 12,
      costPaidAnchor: 30,
      startTurn: 7,
      onlineTurn: 9,
      deliveryBaseFraction: 0,
      constructionLoanId: "loan",
      constructionClaimId: "claim",
    };
    const next = advance({
      completedTurn: 6,
      ownedDailyUnits: 0,
      paidBookAnchor: 0,
      buildQueue: [order],
    });
    expect(next.capacityUnits).toBe(0);
    expect(next.deliveredDailyUnits).toBe(0);
    expect(next.deliveredPaidCostAnchor).toBe(0);
    expect(next.state.paidBookAnchor).toBe(0);
    expect(next.constructionInProgressAnchor).toBe(30);
    expect(next.state.buildQueue).toEqual([order]);
    expect(next.state.buildQueue[0]).toBe(order);

    const firstDelivery = advance(next.state);
    expect(firstDelivery.deliveredDailyUnits).toBe(6);
    expect(firstDelivery.deliveredPaidCostAnchor).toBe(15);
    expect(firstDelivery.constructionInProgressAnchor).toBe(15);
  });

  it.each([
    { startTurn: 8, onlineTurn: 9, deliveryBaseFraction: 0 },
    { startTurn: 7, onlineTurn: 7, deliveryBaseFraction: 0 },
    { startTurn: 7, onlineTurn: 9, deliveryBaseFraction: 0.25 },
  ])("refuses a future or already delivering new schedule: %j", (schedule) => {
    expect(() =>
      advance({
        completedTurn: 6,
        ownedDailyUnits: 0,
        paidBookAnchor: 0,
        buildQueue: [{ unitsOrdered: 12, costPaidAnchor: 30, ...schedule }],
      })
    ).toThrow("schedule");
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
      buildQueue: [{ unitsOrdered: 80, costPaidAnchor: 10, startTurn: 6, onlineTurn: 7 }],
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
        { unitsOrdered: 30, costPaidAnchor: 12, startTurn: 560, onlineTurn: 561 },
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

describe("whole plants: the delivered part of a plant under construction produces", () => {
  const SIZE = 250;
  const wholeState = (): ProducerCapacityState => ({
    completedTurn: 10,
    ownedDailyUnits: SIZE,
    paidBookAnchor: 500,
    buildQueue: [
      { unitsOrdered: SIZE, costPaidAnchor: 1000, startTurn: 10, onlineTurn: 14, smooth: true },
    ],
    wholePlants: { plantUnits: SIZE, creditUnits: 0, wearUnits: 0 },
  });

  it("a one-plant order delivers a quarter of a plant next turn and runs it", () => {
    const next = advance(wholeState());
    expect(next.deliveredDailyUnits).toBeCloseTo(SIZE / 4, 9);
    expect(next.state.ownedDailyUnits).toBe(SIZE);
    expect(next.state.wholePlants?.creditUnits).toBeCloseTo(SIZE / 4, 9);
    expect(next.capacityUnits).toBeCloseTo((SIZE + SIZE / 4) / TURNS_PER_DAY, 9);
  });

  it("telescopes into the whole plant with no capacity lost or counted twice", () => {
    let state = wholeState();
    for (let i = 0; i < 4; i++) {
      const next = advance(state);
      expect(next.capacityUnits).toBeCloseTo(
        (next.state.ownedDailyUnits + (next.state.wholePlants?.creditUnits ?? 0)) / TURNS_PER_DAY,
        9
      );
      state = next.state;
    }
    expect(state.ownedDailyUnits).toBe(2 * SIZE);
    expect(state.wholePlants?.creditUnits ?? 0).toBeCloseTo(0, 9);
    expect(state.buildQueue).toEqual([]);
  });

  it("still scales the part-plant by the active fraction", () => {
    const next = advance(wholeState(), 0.5);
    expect(next.activeUnits).toBeCloseTo((next.capacityUnits * 1) / 2, 12);
  });
});
