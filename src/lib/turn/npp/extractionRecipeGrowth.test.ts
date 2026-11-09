import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CommodityType } from "@/lib/constants/commodities";
import { computeBuildCost, CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import { ceoArchetypeModifiers } from "../ceoArchetype";
import { makeNppCorpDecision } from "./makeCorpDecision";
import { getNppCashFloorAnchor } from "./nppCashReserve";

// Coal and rare earth short, crude at the floor, gas just under base.
const ratios: Partial<Record<CommodityType, number>> = {
  coal: 2.48,
  iron: 0.93,
  oil: 0.28,
  natural_gas: 0.8,
  rare_earth: 1.31,
  timber: 0.28,
};

function growthFor(strategyId: string): number {
  const modifiers = ceoArchetypeModifiers("cautious");
  const quote = computeBuildCost({
    sectorType: "extraction",
    units: 1,
    strategyId,
    year: CAPACITY_ANCHOR_YEAR,
    preset: "2019-default",
    eraUnitScale: 1,
    marketSharePercent: 0,
    nationalMarketSharePercent: 0,
    primeRate: 0,
    acumen: NEUTRAL_STAT,
    hostCostOfLivingIndex: null,
    founding: false,
  });
  const floor = getNppCashFloorAnchor("2019-default", modifiers.cashFloorMult);
  const corp = {
    _id: new ObjectId(),
    type: "extraction",
    countryId: "US",
    headquartersState: "TX",
    liquidCurrencyCode: "USD",
    liquidCapital: floor + quote.totalAnchor * 200,
    ceoType: "npp",
    ceoId: new ObjectId(),
    logisticsStrength: 1000,
  } as Corporation;
  const sector = {
    _id: new ObjectId(),
    corporationId: corp._id,
    sectorType: "extraction",
    strategyId,
    countryId: "US",
    stateId: "TX",
    revenue: 100000,
    profitMargin: 20,
    plantsPnl: { revenue: 100000, costs: 80000, profit: 20000 },
    capitalStock: 200,
    operatingCapacityUnits: 200,
    producedUnits: 200,
    soldUnits: 200,
    buildQueue: [],
  } as unknown as CorporateSector;
  const decision = makeNppCorpDecision(
    {
      corp,
      sectors: [sector],
      turn: 70,
      now: new Date("2026-01-01"),
      modifiers,
      strategyLoopEnabled: false,
    },
    new Map(),
    new Set(),
    (commodity) => ratios[commodity] ?? 1,
    {
      enabled: true,
      eraUnitScale: 1,
      year: CAPACITY_ANCHOR_YEAR,
      preset: "2019-default",
      primeRateOf: () => 0,
      costOfLivingOf: () => null,
    }
  );
  return (decision.reinvestments ?? []).reduce((sum, build) => sum + build.units, 0);
}

describe("NPP mine growth reads the mine's own recipe", () => {
  it("does not grow an oil and gas well on a coal shortage while crude is at the floor", () => {
    // Replacement of worn capacity is upkeep and below one unit here.
    expect(growthFor("oil_gas")).toBeLessThan(1);
  });

  it("still grows a coal mine into the same coal shortage", () => {
    expect(growthFor("coal_mining")).toBeGreaterThan(1);
  });
});
