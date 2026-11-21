import { describe, expect, it } from "vitest";
import type { CorporateSector } from "@/lib/db/types";
import type { FundedReceipt } from "@/lib/market/producerMarket/fundedSectorRules";
import { fundedReceiptOf } from "./fundedProducerTurn";
import { fundedSectorValuation } from "./fundedSectorValuation";

const sector = { capacityBookAnchor: 1000 } as unknown as CorporateSector;
const base: FundedReceipt = {
  revenue: 0,
  profit: -10,
  producedUnits: 20,
  soldUnits: 0,
};
const value = (receipt: FundedReceipt, costs = 10) =>
  fundedSectorValuation({
    sector,
    receipt,
    result: { hourlyRevenue: receipt.revenue, costs },
    currentTurn: 5,
    currentYear: 2020,
    eraUnitScale: 1,
  }).valueAnchor;

describe("fundedSectorValuation own-site credit", () => {
  it("values a supplier with no revenue at its book floor when no credit is on the receipt", () => {
    expect(value(base)).toBe(1000);
  });

  it("values the same supplier above the floor once its own-site deliveries are credited", () => {
    // (0 - 10 + 100) * 48 turns / 0.15 = 28,800
    expect(value({ ...base, valuationCredit: 100 })).toBe(28800);
  });

  it("charges the receiving site the same amount, never below its floor", () => {
    const receiver: FundedReceipt = { ...base, revenue: 200, profit: 150 };
    const free = value(receiver, 50);
    expect(value({ ...receiver, valuationCharge: 100 }, 50)).toBeLessThan(free);
    expect(value({ ...receiver, valuationCharge: 10_000 }, 50)).toBe(1000);
  });

  it("carries the two figures from the settlement onto the receipt only when present", () => {
    const settled = { revenue: 0, profit: -10, producedUnits: 20, soldUnits: 0 };
    const plain = fundedReceiptOf(settled, 0);
    expect(plain).not.toHaveProperty("valuationCredit");
    expect(plain).not.toHaveProperty("valuationCharge");
    const credited = fundedReceiptOf({ ...settled, valuationCredit: 100, valuationCharge: 7 }, 0);
    expect(credited.valuationCredit).toBe(100);
    expect(credited.valuationCharge).toBe(7);
    // Accounts stay as they were: no site income or charge is carried.
    expect(credited.internalSupplyIncome).toBeUndefined();
    expect(credited.internalSupplyCharge).toBeUndefined();
  });
});

describe("fundedSectorValuation recent settled profit", () => {
  const plant = (history?: { turn: number; profit: number }[]) =>
    ({ capacityBookAnchor: 1000, valuationProfitHistory: history }) as unknown as CorporateSector;
  const turn = (sector: CorporateSector, settledTurn: number, profit: number) =>
    fundedSectorValuation({
      sector,
      receipt: { turn: settledTurn, revenue: profit, profit, producedUnits: 1, soldUnits: 1 },
      result: { hourlyRevenue: profit, costs: 0 },
      currentTurn: settledTurn,
      currentYear: 2020,
      eraUnitScale: 1,
    });
  const play = (profits: [number, number][]) => {
    let sector = plant();
    return profits.map(([t, p]) => {
      const out = turn(sector, t, p);
      sector = plant(out.profitHistory);
      return out.valueAnchor;
    });
  };
  // 48 turns a year at 15%: each unit of profit per turn is worth 320.
  const worth = (profit: number) => Math.round(profit * 320);

  it("keeps a plant that alternates good and bad turns at a steady value", () => {
    const values = play(Array.from({ length: 10 }, (_, i) => [50 + i, i % 2 ? 100 : 160]));
    for (const v of values.slice(3)) expect(v).toBe(worth(130));
  });

  it("follows a sustained step within four settled turns, up and down", () => {
    const up = play([
      [1, 100],
      [2, 100],
      [3, 100],
      [4, 100],
      [5, 200],
      [6, 200],
      [7, 200],
      [8, 200],
    ]);
    expect(up.slice(4)).toEqual([worth(125), worth(150), worth(175), worth(200)]);
    const down = play([
      [1, 200],
      [2, 200],
      [3, 200],
      [4, 200],
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
    ]);
    // The last turn is back on the paid capacity book once earnings are gone.
    expect(down.slice(4)).toEqual([worth(150), worth(100), worth(50), 1000]);
  });

  it("does not count turns that were never settled", () => {
    const values = play([
      [106, 100],
      [107, 100],
      [108, 100],
      [114, 100],
    ]);
    expect(values.at(-1)).toBe(worth(100));
  });

  it("returns the history to store, keyed by the settled turn", () => {
    const out = turn(plant([{ turn: 7, profit: 10 }]), 8, 30);
    expect(out.profitHistory).toEqual([
      { turn: 7, profit: 10 },
      { turn: 8, profit: 30 },
    ]);
    expect(out.valueAnchor).toBe(worth(20));
  });
});
