import { describe, expect, it } from "vitest";
import {
  averageSettledProfit,
  recordSettledProfit,
  type SettledProfitEntry,
} from "./recentSettledProfit";

const WINDOW = 4;

function run(turnsAndProfits: [number, number][], start: SettledProfitEntry[] = []) {
  let history = start;
  const averages: number[] = [];
  for (const [turn, profit] of turnsAndProfits) {
    history = recordSettledProfit(history, turn, profit, WINDOW);
    averages.push(averageSettledProfit(history));
  }
  return { history, averages };
}

describe("recent settled profit", () => {
  it("holds steady when profit alternates between a good and a bad turn", () => {
    const turns: [number, number][] = Array.from({ length: 12 }, (_, i) => [
      100 + i,
      i % 2 === 0 ? 160 : 100,
    ]);
    const { averages } = run(turns);
    // Once the window is full, every turn values the same 130.
    for (const avg of averages.slice(WINDOW - 1)) expect(avg).toBe(130);
  });

  it("moves all the way to a sustained step up or down within the window", () => {
    const up = run([
      [1, 100],
      [2, 100],
      [3, 100],
      [4, 100],
      [5, 200],
      [6, 200],
      [7, 200],
      [8, 200],
    ]).averages;
    expect(up.slice(4)).toEqual([125, 150, 175, 200]);

    const down = run([
      [1, 200],
      [2, 200],
      [3, 200],
      [4, 200],
      [5, -40],
      [6, -40],
      [7, -40],
      [8, -40],
    ]).averages;
    expect(down.slice(4)).toEqual([140, 80, 20, -40]);
  });

  it("ignores turns that were never settled instead of counting them as zero", () => {
    // Settled turns 106 to 108, nothing from 109 to 113, then 114.
    const { history, averages } = run([
      [106, 100],
      [107, 100],
      [108, 100],
      [114, 100],
    ]);
    expect(history.map((e) => e.turn)).toEqual([106, 107, 108, 114]);
    expect(averages.at(-1)).toBe(100);
  });

  it("averages what a new plant has so far", () => {
    expect(run([[10, 50]]).averages).toEqual([50]);
    expect(
      run([
        [10, 50],
        [11, 150],
      ]).averages
    ).toEqual([50, 100]);
  });

  it("keeps a sector whose profit has gone negative below zero on average", () => {
    // A mothballed plant still pays its idle bills; the average says so.
    const { averages } = run([
      [1, 100],
      [2, -20],
      [3, -20],
      [4, -20],
      [5, -20],
    ]);
    expect(averages.at(-1)).toBe(-20);
  });

  it("replaces a retried turn and drops entries from the future", () => {
    const once = recordSettledProfit([{ turn: 5, profit: 10 }], 6, 20, WINDOW);
    expect(recordSettledProfit(once, 6, 30, WINDOW)).toEqual([
      { turn: 5, profit: 10 },
      { turn: 6, profit: 30 },
    ]);
    // A world that restarted its turn count cannot average stale later turns.
    expect(recordSettledProfit([{ turn: 90, profit: 999 }], 2, 5, WINDOW)).toEqual([
      { turn: 2, profit: 5 },
    ]);
  });

  it("sorts and cleans a stored history and fails closed on bad numbers", () => {
    const stored = [
      { turn: 3, profit: 30 },
      { turn: 1, profit: Number.NaN },
      { turn: 2, profit: 20 },
    ];
    expect(recordSettledProfit(stored, 4, Number.POSITIVE_INFINITY, WINDOW)).toEqual([
      { turn: 2, profit: 20 },
      { turn: 3, profit: 30 },
      { turn: 4, profit: 0 },
    ]);
    expect(averageSettledProfit([])).toBe(0);
  });
});
