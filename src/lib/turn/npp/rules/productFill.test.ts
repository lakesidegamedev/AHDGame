import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector, UnownedSector } from "@/lib/db/types";
import { computeBuildCost, CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import { plantPressure } from "@/lib/market/producerMarket/shortageGrowthRules";
import { ceoArchetypeModifiers } from "../../ceoArchetype";
import { makeNppCorpDecision } from "../makeCorpDecision";
import { getNppCashFloorAnchor } from "../nppCashReserve";
import { bestProductSellThrough, gateFill } from "./productFill";

// A defense-like plant: ordnance (short) sells out, chemicals sit half
// unsold or go to the company's own sites.
const DEFENSE_PRODUCTS = [
  { commodity: "ordnance", book: "country", offeredUnits: 300, soldUnits: 300 },
  {
    commodity: "chemicals",
    book: "country",
    offeredUnits: 700,
    soldUnits: 200,
    internalDeliveredUnits: 150,
  },
];

describe("bestProductSellThrough", () => {
  it("takes the best product, counting own-site deliveries", () => {
    expect(bestProductSellThrough(DEFENSE_PRODUCTS)).toBe(1);
    expect(
      bestProductSellThrough([{ offeredUnits: 700, soldUnits: 200, internalDeliveredUnits: 150 }])
    ).toBeCloseTo(0.5);
  });
  it("is null without usable rows", () => {
    expect(bestProductSellThrough(undefined)).toBeNull();
    expect(bestProductSellThrough([{ offeredUnits: 0, soldUnits: 0 }])).toBeNull();
  });
});

describe("gateFill", () => {
  it("is the old ratio at stage off", () => {
    expect(gateFill(0, DEFENSE_PRODUCTS, 1000, 500)).toBe(0.5);
    expect(gateFill(undefined, DEFENSE_PRODUCTS, 1000, 500)).toBe(0.5);
  });
  it("is the best product at stage on, and falls back without rows", () => {
    expect(gateFill(1, DEFENSE_PRODUCTS, 1000, 500)).toBe(1);
    expect(gateFill(1, undefined, 1000, 500)).toBe(0.5);
  });
  it("leaves a single-product sector unchanged", () => {
    const one = [{ offeredUnits: 1000, soldUnits: 900 }];
    expect(gateFill(0, one, 1000, 900)).toBe(0.9);
    expect(gateFill(1, one, 1000, 900)).toBe(0.9);
  });
});

describe("plantPressure per product", () => {
  const products = [
    { commodity: "chemicals", book: "country", deliveredUnits: 700 },
    { commodity: "ordnance", book: "country", deliveredUnits: 300 },
  ];
  const pressure = new Map([
    ["chemicals|country", 1],
    ["ordnance|country", 2],
  ]);
  it("follows the biggest product by default", () => {
    expect(plantPressure(products, pressure)).toBe(1);
  });
  it("scores the most pressed product when asked", () => {
    expect(plantPressure(products, pressure, true)).toBe(2);
  });
});

function decide(stage: number | undefined, products: unknown[], sold: number) {
  const plantUnits = 80;
  const modifiers = ceoArchetypeModifiers("cautious");
  const quote = computeBuildCost({
    sectorType: "retail",
    units: 1,
    strategyId: null,
    year: CAPACITY_ANCHOR_YEAR,
    preset: "2019-default",
    eraUnitScale: 1,
    marketSharePercent: (100 * plantUnits) / (plantUnits + 1000),
    nationalMarketSharePercent: 0,
    primeRate: 0,
    acumen: NEUTRAL_STAT,
    hostCostOfLivingIndex: null,
    founding: false,
  });
  const floor = getNppCashFloorAnchor("2019-default", modifiers.cashFloorMult);
  const corp = {
    _id: new ObjectId(),
    type: "retail",
    countryId: "US",
    headquartersState: "NY",
    liquidCurrencyCode: "USD",
    liquidCapital: floor + quote.totalAnchor * 600,
    ceoType: "npp",
    ceoId: new ObjectId(),
    logisticsStrength: 1000,
  } as Corporation;
  const sector = {
    _id: new ObjectId(),
    corporationId: corp._id,
    sectorType: "retail",
    countryId: "US",
    stateId: "NY",
    revenue: 100000,
    profitMargin: 10,
    plantsPnl: { revenue: 100000, costs: 90000, profit: 10000 },
    capitalStock: plantUnits,
    operatingCapacityUnits: plantUnits,
    producedUnits: 100,
    soldUnits: sold,
    buildQueue: [],
    demandThrottleFactor: 1,
    producerSettlement: { worldEpoch: "e", products },
  } as unknown as CorporateSector;
  const pool = {
    _id: new ObjectId(),
    countryId: "US",
    stateId: "NY",
    sectorType: "retail",
    revenue: 100000,
    headroomUnits: 1000,
  } as UnownedSector;
  const d = makeNppCorpDecision(
    {
      corp,
      groupRootId: "root",
      sectors: [sector],
      turn: 70,
      now: new Date("2026-01-01"),
      modifiers,
      strategyLoopEnabled: false,
      ...(stage === undefined ? {} : { productFillStage: stage }),
    },
    new Map([["US", [pool]]]),
    new Set(),
    () => 2,
    {
      enabled: true,
      eraUnitScale: 1,
      year: CAPACITY_ANCHOR_YEAR,
      preset: "2019-default",
      primeRateOf: () => 0,
      costOfLivingOf: () => null,
    }
  );
  return (d.reinvestments ?? []).reduce((sum, b) => sum + b.units, 0);
}

describe("NPP reinvestment gate with per-product fill", () => {
  const defense = [
    { offeredUnits: 30, soldUnits: 30 },
    { offeredUnits: 70, soldUnits: 20, internalDeliveredUnits: 15 },
  ];
  it("blocks a multi-product plant at stage off and grows it at stage on", () => {
    expect(decide(undefined, defense, 50)).toBe(0);
    expect(decide(0, defense, 50)).toBe(0);
    expect(decide(1, defense, 50)).toBeGreaterThan(0);
  });
  it("treats a single-product sector the same either way", () => {
    const glut = [{ offeredUnits: 100, soldUnits: 50 }];
    expect(decide(0, glut, 50)).toBe(0);
    expect(decide(1, glut, 50)).toBe(0);
    const sellOut = [{ offeredUnits: 100, soldUnits: 100 }];
    expect(decide(0, sellOut, 100)).toBeGreaterThan(0);
    expect(decide(1, sellOut, 100)).toBe(decide(0, sellOut, 100));
  });
});
