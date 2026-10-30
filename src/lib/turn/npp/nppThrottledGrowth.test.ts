import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector, UnownedSector } from "@/lib/db/types";
import { computeBuildCost, CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import { ceoArchetypeModifiers } from "../ceoArchetype";
import { makeNppCorpDecision } from "./makeCorpDecision";
import { getNppCashFloorAnchor } from "./nppCashReserve";
import { NPP_GROWTH_MIN_THROTTLE } from "./nppCorporationTuning";

const EPOCH = "epoch-1";

interface FundedRun {
  /** Share of nameplate the plant made this turn. */
  runShare: number;
  /** Share of offered units that sold. */
  sellThrough: number;
  /** Units offered per unit made: above 1 when held stock is also put up. */
  offeredPerProduced?: number;
}

function decide(demandThrottleFactor: number | null, plantUnits = 80, funded?: FundedRun) {
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
    producedUnits: plantUnits,
    soldUnits: plantUnits,
    buildQueue: [],
    ...(demandThrottleFactor === null ? {} : { demandThrottleFactor }),
    ...(funded ? fundedFields(plantUnits, funded) : {}),
  } as unknown as CorporateSector;
  const pool = {
    _id: new ObjectId(),
    countryId: "US",
    stateId: "NY",
    sectorType: "retail",
    revenue: 100000,
    headroomUnits: 1000,
  } as UnownedSector;
  return makeNppCorpDecision(
    {
      corp,
      groupRootId: "root",
      sectors: [sector],
      turn: 70,
      now: new Date("2026-01-01"),
      modifiers,
      strategyLoopEnabled: false,
      ...(funded ? { transitionFirstFundedTurn: 2, fundedWorldEpoch: EPOCH } : {}),
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
}

/** Sector fields a funded turn writes: daily units from a per-turn receipt. */
function fundedFields(plantUnits: number, run: FundedRun) {
  const capacityPerTurn = plantUnits / 24;
  const producedPerTurn = capacityPerTurn * run.runShare;
  const offeredPerTurn = producedPerTurn * (run.offeredPerProduced ?? 1);
  const soldPerTurn = offeredPerTurn * run.sellThrough;
  return {
    // The funded settlement writes sold / capacity here.
    demandThrottleFactor: soldPerTurn / capacityPerTurn,
    producedUnits: producedPerTurn * 24,
    soldUnits: soldPerTurn * 24,
    producerSettlement: {
      worldEpoch: EPOCH,
      turn: 69,
      capacityUnits: capacityPerTurn,
      producedUnits: producedPerTurn,
      offeredUnits: offeredPerTurn,
      soldUnits: soldPerTurn,
    },
  };
}

const growthOf = (d: ReturnType<typeof decide>) =>
  (d.reinvestments ?? []).reduce((sum, build) => sum + build.units, 0);

describe("NPP growth in a throttled market", () => {
  it("grows when the sector is not throttled", () => {
    expect(growthOf(decide(1))).toBeGreaterThan(1);
    expect(growthOf(decide(null))).toBeGreaterThan(1);
    expect(growthOf(decide(NPP_GROWTH_MIN_THROTTLE))).toBeGreaterThan(1);
  });

  it("refuses growth below the throttle floor and records the gate", () => {
    const d = decide(0.5);
    // Replacement of worn capacity is below one whole unit here, so nothing builds.
    expect(growthOf(d)).toBeLessThan(1);
    expect(d.capacityObservations?.some((o) => o.outcome === "growth_throttled_market")).toBe(true);
  });

  it("still replaces worn capacity in a throttled market", () => {
    const d = decide(0.5, 100_000);
    expect(growthOf(d)).toBeGreaterThan(0);
    expect(growthOf(d)).toBeLessThan(growthOf(decide(1, 100_000)));
  });
});

describe("NPP growth on a funded world", () => {
  it("grows a sold-out plant that inputs hold at a quarter of nameplate", () => {
    // Throttle reads 0.25 (sold / capacity), which the legacy gate took for a glut.
    const d = decide(null, 80, { runShare: 0.25, sellThrough: 1 });
    expect(growthOf(d)).toBeGreaterThan(1);
    expect(d.capacityObservations?.some((o) => o.outcome === "growth_throttled_market")).toBe(
      false
    );
  });

  it("still refuses growth when offered output went unsold", () => {
    // Sells as much as it makes, but half of what it offers (stock included) is left over.
    const d = decide(null, 80, { runShare: 1, sellThrough: 0.5, offeredPerProduced: 2 });
    expect(growthOf(d)).toBeLessThan(1);
    expect(d.capacityObservations?.some((o) => o.outcome === "growth_throttled_market")).toBe(true);
  });

  it("keeps the legacy throttle gate on a legacy world", () => {
    const legacy = decide(0.25, 80);
    expect(legacy.capacityObservations?.some((o) => o.outcome === "growth_throttled_market")).toBe(
      true
    );
  });
});
