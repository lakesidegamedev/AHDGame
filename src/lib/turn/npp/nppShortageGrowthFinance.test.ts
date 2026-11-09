import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector, UnownedSector } from "@/lib/db/types";
import { CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import { ceoArchetypeModifiers } from "../ceoArchetype";
import type { NppCorpDecisionContext } from "./corpDecisionTypes";
import { makeNppCorpDecision } from "./makeCorpDecision";
import { getNppCashFloorAnchor } from "./nppCashReserve";
import {
  SHORTAGE_GROWTH_FINANCE_CASH_SHARE,
  SHORTAGE_GROWTH_FINANCE_CONTRIBUTION_SHARE,
  resolveShortageGrowthFinanceConfig,
  shortageGrowthCashContributionLimit,
  type ShortageGrowthFinanceConfig,
} from "./rules/shortageGrowthFinance";

const EPOCH = "epoch-1";
const PLANT_UNITS = 2_400;
const modifiers = ceoArchetypeModifiers("cautious");
const floor = getNppCashFloorAnchor("2019-default", modifiers.cashFloorMult);
const stageOn = resolveShortageGrowthFinanceConfig({ nppShortageGrowthFinanceStage: 1 })!;

/** A sold-out funded retail plant whose owner holds 60% of its cash floor. */
function decide(
  shortageGrowthFinance?: { config: ShortageGrowthFinanceConfig; pressure: number | undefined },
  options: { profit?: number; floorHold?: boolean } = {}
) {
  const cash = floor * 0.6;
  const corp = {
    _id: new ObjectId(),
    type: "retail",
    countryId: "US",
    headquartersState: "NY",
    liquidCurrencyCode: "USD",
    liquidCapital: cash,
    ceoType: "npp",
    ceoId: new ObjectId(),
    logisticsStrength: 1000,
  } as Corporation;
  const capacityPerTurn = PLANT_UNITS / 24;
  const profit = options.profit ?? 40_000;
  const sector = {
    _id: new ObjectId(),
    corporationId: corp._id,
    sectorType: "retail",
    countryId: "US",
    stateId: "NY",
    revenue: 200_000,
    profitMargin: 10,
    plantsPnl: { revenue: 200_000, costs: 200_000 - profit, profit },
    capitalStock: PLANT_UNITS,
    operatingCapacityUnits: PLANT_UNITS,
    producedUnits: PLANT_UNITS,
    soldUnits: PLANT_UNITS,
    buildQueue: [],
    demandThrottleFactor: 1,
    producerSettlement: {
      worldEpoch: EPOCH,
      turn: 69,
      capacityUnits: capacityPerTurn,
      producedUnits: capacityPerTurn,
      offeredUnits: capacityPerTurn,
      soldUnits: capacityPerTurn,
      products: [{ commodity: "retail", book: "US", deliveredUnits: capacityPerTurn }],
    },
  } as unknown as CorporateSector;
  const pool = {
    _id: new ObjectId(),
    countryId: "US",
    stateId: "NY",
    sectorType: "retail",
    revenue: 100_000,
    headroomUnits: 1_000,
  } as UnownedSector;
  const ctx: NppCorpDecisionContext = {
    corp,
    groupRootId: "root",
    sectors: [sector],
    turn: 70,
    now: new Date("2026-01-01"),
    modifiers,
    strategyLoopEnabled: false,
    transitionFirstFundedTurn: 2,
    fundedWorldEpoch: EPOCH,
    ...(shortageGrowthFinance
      ? {
          shortageGrowthFinance: {
            config: shortageGrowthFinance.config,
            pressureOf: () => shortageGrowthFinance.pressure,
          },
        }
      : {}),
  };
  const decision = makeNppCorpDecision(ctx, new Map([["US", [pool]]]), new Set(), () => 2, {
    enabled: true,
    eraUnitScale: 1,
    year: CAPACITY_ANCHOR_YEAR,
    preset: "2019-default",
    primeRateOf: () => 0,
    costOfLivingOf: () => null,
    ...(options.floorHold ? { holdExpansionAtCashFloor: true } : {}),
  });
  return { decision, cash };
}

const growthIntents = (d: ReturnType<typeof decide>["decision"]) =>
  (d.constructionFinanceIntents ?? []).filter((intent) => intent.growthUnits > 0);

describe("short-lane growth finance in the NPP decision", () => {
  it("requests finance for one growth step below the cash floor on a short, profitable lane", () => {
    const { decision, cash } = decide({ config: stageOn, pressure: 1.6 });
    const [intent] = growthIntents(decision);
    expect(intent).toBeDefined();
    expect(intent.shortageGrowth?.pressure).toBe(1.6);
    expect(intent.shortageGrowth?.paybackTurns).toBeLessThanOrEqual(stageOn.maxPaybackTurns);
    // Never more than one growth step (half the run rate).
    expect(intent.growthUnits).toBeGreaterThan(0);
    expect(intent.growthUnits).toBeLessThanOrEqual(PLANT_UNITS / 2);
    // Sized so the company's own share of the order fits a quarter of its cash;
    // the turn shell sets the request's cash limit from post-decision cash.
    expect(intent.costLocal * SHORTAGE_GROWTH_FINANCE_CONTRIBUTION_SHARE).toBeLessThanOrEqual(
      cash * SHORTAGE_GROWTH_FINANCE_CASH_SHARE
    );
    // Nothing is paid from cash at decision time.
    expect(decision.liquidCapitalDelta).toBe(0);
  });

  it("stage off: no growth leg below the floor, as before", () => {
    const off = decide(undefined).decision;
    expect(growthIntents(off)).toHaveLength(0);
    expect((off.constructionFinanceIntents ?? []).some((i) => i.shortageGrowth)).toBe(false);
  });

  it("stage on but the lane is not short: identical to stage off", () => {
    const off = decide(undefined).decision;
    const notShort = decide({ config: stageOn, pressure: 1.2 }).decision;
    const strip = (d: typeof off) =>
      (d.constructionFinanceIntents ?? []).map((i) => ({
        growthUnits: i.growthUnits,
        units: i.order.unitsOrdered,
        limit: i.cashContributionLimitLocal,
        shortageGrowth: i.shortageGrowth,
      }));
    expect(strip(notShort)).toEqual(strip(off));
    expect(notShort.liquidCapitalDelta).toBe(off.liquidCapitalDelta);
  });

  it("refuses a payback beyond the horizon", () => {
    const strict = { ...stageOn, maxPaybackTurns: 0.0001 };
    expect(growthIntents(decide({ config: strict, pressure: 1.6 }).decision)).toHaveLength(0);
  });

  it("refuses an unprofitable plant", () => {
    const d = decide({ config: stageOn, pressure: 1.6 }, { profit: -5_000 }).decision;
    expect((d.constructionFinanceIntents ?? []).some((i) => i.shortageGrowth)).toBe(false);
  });
});

describe("short-lane finance under the cash-floor hold (nppDividendAfterTaxStage 2)", () => {
  it("still requests short-lane finance for a company under its floor", () => {
    const { decision } = decide({ config: stageOn, pressure: 1.6 }, { floorHold: true });
    expect(growthIntents(decision).some((i) => i.shortageGrowth)).toBe(true);
    expect(decision.liquidCapitalDelta).toBe(0);
  });

  it("without short-lane finance the hold still stops growth", () => {
    const { decision } = decide(undefined, { floorHold: true });
    expect(growthIntents(decision)).toEqual([]);
    expect(decision.newSectors ?? []).toEqual([]);
  });

  it("caps the held company's own share at a tenth of its cash", () => {
    expect(shortageGrowthCashContributionLimit(1000, 2000, true)).toBeCloseTo(100);
    expect(shortageGrowthCashContributionLimit(1000, 2000)).toBeCloseTo(250);
    expect(shortageGrowthCashContributionLimit(3000, 2000, true)).toBeCloseTo(1000);
  });
});
