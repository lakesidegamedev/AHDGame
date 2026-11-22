import { describe, expect, it } from "vitest";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import {
  computeSectorCommodityUnits,
  type FlowSector,
} from "@/lib/corporations/corpCommodityFlows";
import { getEffectiveStrategyRates } from "@/lib/constants/sectorStrategies";
import {
  billedInputUnitPrice,
  inputBoughtScale,
  inputBoughtUnitsPerDay,
} from "@/lib/corporations/rules/inputBoughtUnits";

const TURN = 100;
const sector: FlowSector = {
  sectorType: "manufacturing",
  stateId: "s1",
  revenue: 50_000,
  revenueAnchor: 50_000,
  strategyId: "standard",
};
const demandRates = () =>
  getEffectiveStrategyRates("manufacturing", "standard", undefined, undefined, TURN).demand;
const globalPriceOf = (c: keyof typeof COMMODITY_BASE_PRICES) => COMMODITY_BASE_PRICES[c] * 1.3;

describe("inputBoughtScale", () => {
  it("is 1 before a bill is booked", () => {
    expect(inputBoughtScale(null, [{ units: 10, price: 2 }])).toBe(1);
  });
  it("is the booked bill over the nameplate bill", () => {
    expect(inputBoughtScale(10, [{ units: 10, price: 2 }])).toBeCloseTo(0.5, 9);
  });
});

describe("sector page and Commodities tab read one input quantity", () => {
  it("returns the same units a day per input", () => {
    const rates = demandRates();
    const nameplateRows = Object.entries(rates).map(([c, rate]) => {
      const commodity = c as keyof typeof COMMODITY_BASE_PRICES;
      return {
        commodity,
        units: (50_000 * (rate as number)) / COMMODITY_BASE_PRICES[commodity],
        price: billedInputUnitPrice(commodity, globalPriceOf(commodity)),
      };
    });
    const nameplateBill = nameplateRows.reduce((s, r) => s + r.units * r.price, 0);
    const booked = nameplateBill * 0.76;
    // What the sector page panel computes: nameplate rows times the scale.
    const scale = inputBoughtScale(booked, nameplateRows);
    const panel = new Map(nameplateRows.map((r) => [r.commodity, r.units * scale]));

    const tab = computeSectorCommodityUnits({ ...sector, inputsBookedPerDay: booked }, TURN, {
      globalPriceOf,
    }).demand;

    expect(tab.size).toBe(panel.size);
    for (const [commodity, units] of panel) {
      expect(tab.get(commodity)).toBeCloseTo(units, 6);
    }
    const direct = inputBoughtUnitsPerDay({
      revenueAnchor: 50_000,
      demandRates: rates,
      bookedInputsPerDay: booked,
      globalPriceOf,
    });
    for (const [commodity, units] of panel) expect(direct.get(commodity)).toBeCloseTo(units, 6);
  });
});
