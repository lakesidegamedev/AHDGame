import { describe, expect, it } from "vitest";
import { TURNS_PER_DAY } from "@/lib/constants/corporationsClient";
import {
  bookPerTurn,
  commodityDetailPerTurn,
  commodityListRowPerTurn,
  recordPerTurn,
} from "./perTurnUnits";

const book = (units: number) => units * TURNS_PER_DAY;

describe("market figures per turn", () => {
  it("divides a price-phase figure back to per turn, and leaves missing values alone", () => {
    expect(bookPerTurn(book(2200))).toBe(2200);
    expect(bookPerTurn(null)).toBeNull();
    expect(bookPerTurn(undefined)).toBeUndefined();
    expect(recordPerTurn({ CA: book(10), TX: book(4) })).toEqual({ CA: 10, TX: 4 });
  });

  it("puts every supply and demand figure on a commodity page in the unit companies are measured in", () => {
    const detail = commodityDetailPerTurn({
      globalSupply: book(9000),
      globalDemand: book(10_000),
      stateSupply: { CA: book(100) },
      stateDemand: { CA: book(120) },
      nationalSupply: { US: book(5000) },
      nationalDemand: { US: book(6000) },
      fundedCountryBooks: {
        US: {
          supply: book(5000),
          demand: book(6000),
          spilloverRequested: 0,
          filled: book(5500),
          funded: null,
          imports: book(700),
          exports: book(200),
        },
      },
      flows: {
        clearedUnits: book(8000),
        clearedUnitsPooled: book(8000),
        unmetDemandUnits: book(2000),
        unmetDemandUnitsPooled: book(2000),
        surplusUnits: 0,
        surplusUnitsPooled: 0,
        stockUnits: null,
      },
      scarcityBreakdown: { supply: book(9000), demand: book(10_000) },
      history: [{ supply: book(8800), demand: book(9900) }],
      syntheticDemandSources: [{ units: book(300), receivedUnits: book(250) }],
      demandDriver: { sourceUnits: book(40) },
      // Already per turn: company volumes are untouched.
      topProducers: [{ units: 2200 }],
      totalCapacity: 50,
    });
    expect(detail.globalSupply).toBe(9000);
    expect(detail.globalDemand).toBe(10_000);
    expect(detail.stateDemand).toEqual({ CA: 120 });
    expect(detail.nationalSupply).toEqual({ US: 5000 });
    expect(detail.fundedCountryBooks!.US).toEqual({
      supply: 5000,
      demand: 6000,
      spilloverRequested: 0,
      filled: 5500,
      funded: null,
      imports: 700,
      exports: 200,
    });
    expect(detail.flows!.unmetDemandUnits).toBe(2000);
    expect(detail.flows!.stockUnits).toBeNull();
    expect(detail.scarcityBreakdown).toEqual({ supply: 9000, demand: 10_000 });
    expect(detail.history).toEqual([{ supply: 8800, demand: 9900 }]);
    expect(detail.syntheticDemandSources).toEqual([{ units: 300, receivedUnits: 250 }]);
    expect(detail.demandDriver).toEqual({ sourceUnits: 40 });
    expect(detail.topProducers).toEqual([{ units: 2200 }]);
    expect(detail.totalCapacity).toBe(50);
    // A company at 2,200 is now about a quarter of the 9,000 world supply, not 1%.
    expect(2200 / detail.globalSupply).toBeCloseTo(0.244, 3);
  });

  it("does the same for a row of the commodity market list", () => {
    const row = commodityListRowPerTurn({
      globalSupply: book(9000),
      globalDemand: book(10_000),
      exchangeSupply: book(4000),
      exchangeDemand: book(4500),
      stateSupply: { CA: book(100) },
      label: "Advertising",
    });
    expect(row).toEqual({
      globalSupply: 9000,
      globalDemand: 10_000,
      exchangeSupply: 4000,
      exchangeDemand: 4500,
      stateSupply: { CA: 100 },
      label: "Advertising",
    });
  });
});
