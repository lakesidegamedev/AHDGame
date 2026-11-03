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
  /** Short inputs cut the funded run to this share (receipt billedRunShare). */
  inputCutShare?: number;
  /** The company's cash could not fund the whole run. */
  cashCut?: boolean;
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
      ...(run.inputCutShare != null || run.cashCut
        ? {
            ...(run.inputCutShare != null ? { billedRunShare: run.inputCutShare } : {}),
            runCutBy: [
              ...(run.cashCut ? ["cash"] : []),
              ...(run.inputCutShare != null ? ["inputs"] : []),
            ],
          }
        : {}),
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
  it("grows a sold-out plant running at a quarter of nameplate", () => {
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

describe("NPP and autopilot growth with starved inputs", () => {
  const outcomes = (d: ReturnType<typeof decide>) =>
    (d.capacityObservations ?? []).map((o) => o.outcome);

  it("refuses growth when short inputs cut last turn's run below half", () => {
    const d = decide(null, 80, { runShare: 0.3, sellThrough: 1, inputCutShare: 0.3 });
    expect(growthOf(d)).toBeLessThan(1);
    expect(outcomes(d)).toContain("growth_inputs_starved");
  });

  it("still grows when inputs only trimmed the run", () => {
    const d = decide(null, 80, { runShare: 0.8, sellThrough: 1, inputCutShare: 0.8 });
    expect(growthOf(d)).toBeGreaterThan(1);
    expect(outcomes(d)).not.toContain("growth_inputs_starved");
  });

  it("keeps replacing worn capacity on a starved plant", () => {
    const d = decide(null, 100_000, { runShare: 0.3, sellThrough: 1, inputCutShare: 0.3 });
    expect(outcomes(d)).toContain("growth_inputs_starved");
    expect(growthOf(d)).toBeGreaterThan(0);
  });
});

describe("NPP builds while plants are idle for want of cash", () => {
  const outcomes = (d: ReturnType<typeof decide>) =>
    (d.capacityObservations ?? []).map((o) => o.outcome);

  it("queues no capacity, growth or replacement, after a cash-cut run", () => {
    const d = decide(null, 100_000, { runShare: 0.5, sellThrough: 1, cashCut: true });
    expect(growthOf(d)).toBe(0);
    expect(outcomes(d)).toContain("cash_cut_run");
    expect(d.newSectors ?? []).toHaveLength(0);
  });

  it("builds as before when the run was not cut by cash", () => {
    const d = decide(null, 100_000, { runShare: 0.5, sellThrough: 1 });
    expect(growthOf(d)).toBeGreaterThan(0);
    expect(outcomes(d)).not.toContain("cash_cut_run");
  });
});
