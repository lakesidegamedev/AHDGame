/**
 * Unit tests for processRdInnovations — pure-computation R&D breakthrough phase.
 *
 * processRdInnovations is a pure function that accepts pre-built lookup maps
 * and returns bulk write ops for sector revenue boosts and state resource
 * capacity boosts. Tests cover: interval gating, probability gating, boost
 * magnitude floors (Q2), multi-resource capacity allocation (Q4), currency
 * handling (no double-conversion — boostAmount stays in corp-local), and
 * capacity skipping for states without a capacity doc.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ObjectId } from "mongodb";
import { processRdInnovations, type RdInnovationResult } from "./rdInnovation";
import type { CorporationLookups } from "./types";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { ExtractableResource } from "@/lib/constants/commodities";
import {
  RD_EXTRACTION_BOOST_MAX,
  RD_REGULAR_BOOST_MIN,
  RD_REGULAR_BOOST_MAX,
  RD_CAPACITY_BOOST_MIN_PCT,
  RD_INNOVATION_INTERVAL,
} from "@/lib/constants/corporations";

// Stub the notification side effect so tests don't hit the DB layer.
vi.mock("@/lib/notifications", () => ({
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));

function revenueBoost(operation: RdInnovationResult["sectorBoostOps"][number]): number {
  const update = operation.updateOne.update;
  if (Array.isArray(update)) throw new Error("Expected a legacy revenue update");
  const boost = update.$inc?.revenue;
  if (typeof boost !== "number") throw new Error("Expected a numeric revenue boost");
  return boost;
}

function baseLookups(
  corporations: Corporation[],
  sectors: CorporateSector[],
  opts: {
    stateResourceCapacity?: Map<string, Partial<Record<ExtractableResource, number>>>;
  } = {}
): CorporationLookups {
  const sectorsByCorp = new Map<string, CorporateSector[]>();
  for (const s of sectors) {
    const k = s.corporationId.toString();
    sectorsByCorp.set(k, [...(sectorsByCorp.get(k) ?? []), s]);
  }
  return {
    eraUnitScale: 1,
    corporations,
    sectorsByCorp,
    primeRateSmoothedByCountry: new Map(),
    corpById: new Map(corporations.map((c) => [c._id.toString(), c])),
    ceoBusinessAcumenByCorpId: new Map(),
    bondsByCorpId: new Map(),
    bondsHeldByCorpId: new Map(),
    portfolioAnchorValueByCorpId: new Map(),
    bondAndImfPortfolioAnchorByCorpId: new Map(),
    issuedBondDebtByCorpId: new Map(),
    crossCorpStockHoldingsByHolderCorpId: new Map(),
    primeRateByCountry: new Map(),
    macroInflationByCountry: new Map(),
    investorConfidenceByCountry: new Map(),
    macroDebtToGdpByCountry: new Map(),
    macroDeficitByCountry: new Map(),
    sovereignDefaultMarginByCorpId: new Map(),
    unemploymentByState: new Map(),
    gridReliabilityByState: new Map(),
    corruptionByState: new Map(),
    workforceSkillByState: new Map(),
    rawWorkforceSkillByState: new Map(),
    labourTightnessByState: new Map(),
    crimeRateByState: new Map(),
    broadbandByState: new Map(),
    roadConditionByState: new Map(),
    carbonEmissionsByState: new Map(),
    costOfLivingByState: new Map(),
    globalCommodityBalances: new Map(),
    priceRatioByCommodity: new Map(),
    landedPremiumByState: new Map(),
    nationalCommodityBalancesByCountry: new Map(),
    countryClearingBooks: null,
    exportIntensityByCountry: new Map(),
    rawStateBalances: new Map(),
    sectorPresenceKeys: new Set(),
    allTariffs: [],
    activeFtaPairs: new Set<string>(),
    ftaCoverage: {
      byCountryEconomyWide: new Map(),
      bySectorType: new Map(),
      corpHqByCorpId: new Map(),
      pairs: new Set<string>(),
    },
    activeSubsidies: [],
    federalBudgets: [],
    domesticCorpTaxRateByCountry: new Map(),
    foreignCorpTaxRateByCountry: new Map(),
    domesticStateCorpTaxRateByState: new Map(),
    foreignStateCorpTaxRateByState: new Map(),
    // JP corp at 150 JPY/USD anchor — used by currency-safety test to prove
    // that boostAmount is NOT double-converted through the FX rate.
    exchangeRatesByCurrency: new Map([
      ["USD", 1.0],
      ["JPY", 150],
    ]),
    stateCountryMap: new Map(),
    stateResourceCapacityByState: opts.stateResourceCapacity ?? new Map(),
    extractionCapacityUtilBySector: new Map(),
    marketShareBySectorId: new Map(),
    stateSectorSpecializationByState: new Map(),
    activeDisasterEffectsByState: new Map(),
    stateInputAvailabilityByState: new Map(),
  };
}

function makeCorp(overrides: Partial<Corporation> = {}): Corporation {
  return {
    _id: new ObjectId(),
    name: "TestCorp",
    type: "manufacturing",
    secondaryType: null,
    countryId: "US",
    headquartersState: "US-CA",
    liquidCapital: 0,
    marketingBudget: 0,
    marketingStrength: 0,
    logisticsBudget: 0,
    logisticsStrength: 0,
    rdBudget: 0,
    rdScore: 0,
    ceoId: new ObjectId(),
    userId: new ObjectId(),
    totalShares: 10_000_000,
    sharePrice: 1.0,
    shareholders: [],
    dividendRate: 0,
    ceoSalary: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Corporation;
}

function makeSector(corpId: ObjectId, overrides: Partial<CorporateSector> = {}): CorporateSector {
  return {
    _id: new ObjectId(),
    corporationId: corpId,
    countryId: "US",
    stateId: "US-CA",
    sectorType: "manufacturing",
    revenue: 100_000,
    targetGrowthRate: 0,
    currentGrowthRate: 0,
    currentGrowthCost: 0,
    profitMargin: 50,
    workers: 100,
    strategyId: "standard",
    transitionFromStrategyId: null,
    transitionStartTurn: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CorporateSector;
}

describe("processRdInnovations", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  beforeEach(() => {
    // Force Math.random() to return 0 so every probability check passes —
    // rdScore > 0 → probability > 0 → 0 <= probability always.
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("under plants boosts capitalStock by the same percentage and never writes revenue", () => {
    const corp = makeCorp({ rdScore: 200 });
    const sector = makeSector(corp._id, { capitalStock: 1_000 });
    const result = processRdInnovations(
      baseLookups([corp], [sector]),
      6,
      now,
      () => 0,
      /* plantsEnabled */ true
    );

    expect(result.innovationsTriggered).toBe(1);
    const update = result.sectorBoostOps[0]!.updateOne.update;
    if (!Array.isArray(update)) throw new Error("Expected a plant capacity update pipeline");
    const pipeline = update;
    expect(pipeline[0]).not.toHaveProperty("$inc.revenue");
    // rng 0 → the MIN of the regular boost band, applied to the STOCK.
    const stockDelta = (
      pipeline[0]?.$set as { capitalStock: { $max: [number, { $add: [unknown, number] }] } }
    ).capitalStock.$max[1].$add[1];
    expect(stockDelta).toBeGreaterThan(0);
    expect(stockDelta).toBeLessThan(1_000);
  });

  it("under plants skips a sector with no capacity to improve", () => {
    const corp = makeCorp({ rdScore: 200 });
    const sector = makeSector(corp._id, { capitalStock: 0 });
    const result = processRdInnovations(
      baseLookups([corp], [sector]),
      6,
      now,
      () => 0,
      /* plantsEnabled */ true
    );
    expect(result.sectorBoostOps).toHaveLength(0);
  });

  it("returns empty ops when turn is not on the innovation interval", () => {
    const corp = makeCorp({ rdScore: 200 });
    const sector = makeSector(corp._id);
    const result = processRdInnovations(baseLookups([corp], [sector]), 5, now);

    // RD_INNOVATION_INTERVAL === 6, so turn 5 % 6 !== 0
    expect(5 % RD_INNOVATION_INTERVAL).not.toBe(0);
    expect(result.innovationsTriggered).toBe(0);
    expect(result.sectorBoostOps).toHaveLength(0);
    expect(result.capacityBoostOps).toHaveLength(0);
  });

  it("skips corps with rdScore = 0", () => {
    const corp = makeCorp({ rdScore: 0 });
    const sector = makeSector(corp._id);
    const result = processRdInnovations(baseLookups([corp], [sector]), 6, now);

    expect(result.innovationsTriggered).toBe(0);
    expect(result.sectorBoostOps).toHaveLength(0);
  });

  it("skips corps when Math.random exceeds probability", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const corp = makeCorp({ rdScore: 50 }); // probability 0.25 < 0.99
    const sector = makeSector(corp._id);
    const result = processRdInnovations(baseLookups([corp], [sector]), 6, now);

    expect(result.innovationsTriggered).toBe(0);
  });

  it("rolls boost magnitude uniformly across [MIN, MAX] at rdScore = 200 (regular corp)", () => {
    // Three Math.random() calls per breakthrough: (1) proc check, (2) sector
    // picker, (3) magnitude roll. Default beforeEach mock returns 0, used for
    // calls we don't override here.
    const randSpy = vi.spyOn(Math, "random");
    randSpy.mockReturnValueOnce(0); // proc — always passes
    randSpy.mockReturnValueOnce(0); // sector picker → sectors[0]
    randSpy.mockReturnValueOnce(1); // magnitude — full MAX
    const corp = makeCorp({ rdScore: 200, type: "manufacturing" });
    const sector = makeSector(corp._id, { revenue: 100_000 });
    const result = processRdInnovations(baseLookups([corp], [sector]), 6, now);

    expect(result.innovationsTriggered).toBe(1);
    expect(result.sectorBoostOps).toHaveLength(1);
    const op = result.sectorBoostOps[0];
    expect(revenueBoost(op)).toBe(Math.round(100_000 * RD_REGULAR_BOOST_MAX));
  });

  it("magnitude is RNG, not a function of rdScore (same score → different rolls produce different boosts)", () => {
    // Run two breakthroughs at the same high rdScore but different magnitude rolls.
    const randSpy = vi.spyOn(Math, "random");
    const corp = makeCorp({ rdScore: 200, type: "manufacturing" });
    const sectorA = makeSector(corp._id, { revenue: 100_000 });
    const sectorB = makeSector(corp._id, { revenue: 100_000 });

    randSpy.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.25); // proc, sector, magnitude
    const a = processRdInnovations(baseLookups([corp], [sectorA]), 6, now);

    randSpy.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.9);
    const b = processRdInnovations(baseLookups([corp], [sectorB]), 6, now);

    const boostA = revenueBoost(a.sectorBoostOps[0]);
    const boostB = revenueBoost(b.sectorBoostOps[0]);
    expect(boostB).toBeGreaterThan(boostA);
  });

  it("applies the regular-corp minimum floor when magnitude roll is 0 (Q2)", () => {
    // Default mock: Math.random → 0 for both proc and magnitude.
    // Magnitude roll of 0 → boost = MIN exactly.
    const corp = makeCorp({ rdScore: 1, type: "manufacturing" });
    const sector = makeSector(corp._id, { revenue: 100_000 });
    const result = processRdInnovations(baseLookups([corp], [sector]), 6, now);

    expect(result.innovationsTriggered).toBe(1);
    const op = result.sectorBoostOps[0];
    expect(revenueBoost(op)).toBe(Math.round(100_000 * RD_REGULAR_BOOST_MIN));
  });

  it("can select either equally constrained extraction operation", () => {
    const corp = makeCorp({ rdScore: 200, type: "extraction" });
    const sectors = [
      makeSector(corp._id, { sectorType: "extraction", stateId: "US-CA" }),
      makeSector(corp._id, { sectorType: "extraction", stateId: "US-TX" }),
    ];
    const lookups = baseLookups([corp], sectors);
    for (const sector of sectors) {
      lookups.extractionCapacityUtilBySector.set(sector._id.toString(), {
        utilization: 1,
        bindingResource: "iron",
      });
    }
    for (const [roll, expected] of [
      [0, 0],
      [0.99, 1],
    ] as const) {
      const rng = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(roll).mockReturnValue(0);
      const result = processRdInnovations(lookups, 6, now, rng);
      expect(result.sectorBoostOps[0].updateOne.filter._id).toEqual(sectors[expected]._id);
    }
  });

  it("prioritizes lower producible output rather than the least constrained mine", () => {
    const corp = makeCorp({ rdScore: 200, type: "extraction" });
    const sectors = [makeSector(corp._id), makeSector(corp._id)];
    const lookups = baseLookups([corp], sectors);
    lookups.extractionCapacityUtilBySector.set(sectors[0]._id.toString(), {
      utilization: 0.9,
      bindingResource: "iron",
    });
    lookups.extractionCapacityUtilBySector.set(sectors[1]._id.toString(), {
      utilization: 0.3,
      bindingResource: "iron",
    });
    const result = processRdInnovations(lookups, 6, now, () => 0);
    expect(result.sectorBoostOps[0].updateOne.filter._id).toEqual(sectors[1]._id);
  });

  it("applies RD_EXTRACTION_BOOST_MAX for extraction corps when magnitude roll is 1.0", () => {
    const randSpy = vi.spyOn(Math, "random");
    // Extraction corps pick the sector by capacity utilization (no RNG sector
    // roll), so the calls are: (1) proc check, (2) magnitude roll.
    randSpy.mockReturnValueOnce(0).mockReturnValueOnce(1); // proc, magnitude
    const corp = makeCorp({ rdScore: 200, type: "extraction" });
    const sector = makeSector(corp._id, { sectorType: "extraction", revenue: 100_000 });
    const result = processRdInnovations(baseLookups([corp], [sector]), 6, now);

    expect(result.innovationsTriggered).toBe(1);
    const op = result.sectorBoostOps[0];
    expect(revenueBoost(op)).toBe(Math.round(100_000 * RD_EXTRACTION_BOOST_MAX));
  });

  it("does NOT double-convert boost through FX (JP corp currency-safety)", () => {
    // Pre-fix: boostAmount was passed through anchorToCorpCapital(..., "JPY", 150),
    // inflating the $inc by ~150×. Now boostAmount is written local directly.
    const randSpy = vi.spyOn(Math, "random");
    randSpy.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(1); // proc, sector, magnitude → MAX
    const corp = makeCorp({
      rdScore: 200,
      type: "manufacturing",
      countryId: "JP",
      liquidCurrencyCode: "JPY",
    });
    const sector = makeSector(corp._id, { revenue: 1_000_000 }); // ¥1M local
    const result = processRdInnovations(baseLookups([corp], [sector]), 6, now);

    expect(result.innovationsTriggered).toBe(1);
    // Expected boost: ¥1M × MAX = ¥50,000 (post-rebalance). If FX bug returned, we'd see ~¥7.5M.
    const op = result.sectorBoostOps[0];
    expect(revenueBoost(op)).toBe(Math.round(1_000_000 * RD_REGULAR_BOOST_MAX));
  });

  it("skips capacity boost for states without a capacity document", () => {
    const corp = makeCorp({ rdScore: 200, type: "extraction" });
    const sector = makeSector(corp._id, { sectorType: "extraction", strategyId: "iron_mining" });
    // No entry in stateResourceCapacityByState → uncapped state
    const result = processRdInnovations(baseLookups([corp], [sector]), 6, now);

    expect(result.innovationsTriggered).toBe(1);
    expect(result.sectorBoostOps).toHaveLength(1);
    expect(result.capacityBoostOps).toHaveLength(0);
  });

  const seeds =
    (byState: Record<string, Partial<Record<ExtractableResource, number>>>) =>
    (_countryId: string, stateId: string) =>
      byState[stateId];

  function constrain(
    lookups: CorporationLookups,
    sector: CorporateSector,
    bindingResource: ExtractableResource | null,
    utilization = 0.5
  ) {
    lookups.extractionCapacityUtilBySector.set(sector._id.toString(), {
      utilization,
      bindingResource,
    });
  }

  it("grows only the binding resource of a deposit-constrained mine", () => {
    // oil_gas strategy produces oil and natural gas; only oil binds.
    const corp = makeCorp({ rdScore: 200, type: "extraction" });
    const sector = makeSector(corp._id, {
      sectorType: "extraction",
      strategyId: "oil_gas",
      stateId: "US-TX",
    });
    const cap = new Map<string, Partial<Record<ExtractableResource, number>>>();
    cap.set("US-TX", { oil: 100_000, natural_gas: 50_000 });
    const lookups = baseLookups([corp], [sector], { stateResourceCapacity: cap });
    constrain(lookups, sector, "oil");
    const result = processRdInnovations(
      lookups,
      6,
      now,
      Math.random,
      false,
      seeds({ "US-TX": { oil: 100_000, natural_gas: 50_000 } })
    );

    expect(result.innovationsTriggered).toBe(1);
    expect(result.capacityBoostOps).toHaveLength(1);
    const op = result.capacityBoostOps[0];
    expect(op.updateOne.filter.stateId).toBe("US-TX");
    // Math.random is mocked to 0, so the growth roll lands on the minimum.
    expect(op.updateOne.update.$inc).toEqual({
      "resources.oil": Math.round(100_000 * RD_CAPACITY_BOOST_MIN_PCT),
    });
  });

  it("does not grow deposits for a mine that is not deposit-constrained", () => {
    const corp = makeCorp({ rdScore: 200, type: "extraction" });
    const sector = makeSector(corp._id, {
      sectorType: "extraction",
      strategyId: "oil_gas",
      stateId: "US-TX",
    });
    const cap = new Map<string, Partial<Record<ExtractableResource, number>>>();
    cap.set("US-TX", { oil: 100_000, natural_gas: 50_000 });
    const seedMap = seeds({ "US-TX": { oil: 100_000, natural_gas: 50_000 } });
    for (const [utilization, binding] of [
      [1, null],
      [0.98, null],
    ] as const) {
      const lookups = baseLookups([corp], [sector], { stateResourceCapacity: cap });
      constrain(lookups, sector, binding, utilization);
      const result = processRdInnovations(lookups, 6, now, Math.random, false, seedMap);
      expect(result.innovationsTriggered).toBe(1);
      expect(result.capacityBoostOps).toHaveLength(0);
    }
    // No utilization entry at all reads as unconstrained.
    const lookups = baseLookups([corp], [sector], { stateResourceCapacity: cap });
    expect(
      processRdInnovations(lookups, 6, now, Math.random, false, seedMap).capacityBoostOps
    ).toHaveLength(0);
  });

  it("never grows a deposit past three times its seed", () => {
    const corp = makeCorp({ rdScore: 200, type: "extraction" });
    const sector = makeSector(corp._id, {
      sectorType: "extraction",
      strategyId: "iron_mining",
      stateId: "US-MN",
    });
    const seedMap = seeds({ "US-MN": { iron: 100_000 } });
    for (const [live, expected] of [
      [299_500, 500],
      [300_000, 0],
      [58_000_000, 0],
    ] as const) {
      const cap = new Map<string, Partial<Record<ExtractableResource, number>>>();
      cap.set("US-MN", { iron: live });
      const lookups = baseLookups([corp], [sector], { stateResourceCapacity: cap });
      constrain(lookups, sector, "iron");
      const result = processRdInnovations(lookups, 6, now, () => 0.99, false, seedMap);
      const inc = result.capacityBoostOps[0]?.updateOne.update.$inc["resources.iron"] ?? 0;
      expect(inc).toBe(expected);
    }
  });

  it("stacks same-state breakthroughs in one op without passing the ceiling", () => {
    const corpA = makeCorp({ rdScore: 200, type: "extraction" });
    const corpB = makeCorp({ rdScore: 200, type: "extraction" });
    const sectorA = makeSector(corpA._id, {
      sectorType: "extraction",
      strategyId: "iron_mining",
      stateId: "US-MN",
    });
    const sectorB = makeSector(corpB._id, {
      sectorType: "extraction",
      strategyId: "iron_mining",
      stateId: "US-MN",
    });
    const cap = new Map<string, Partial<Record<ExtractableResource, number>>>();
    cap.set("US-MN", { iron: 500_000 });
    const lookups = baseLookups([corpA, corpB], [sectorA, sectorB], {
      stateResourceCapacity: cap,
    });
    constrain(lookups, sectorA, "iron");
    constrain(lookups, sectorB, "iron");
    const result = processRdInnovations(
      lookups,
      6,
      now,
      Math.random,
      false,
      seeds({ "US-MN": { iron: 1_000_000 } })
    );

    expect(result.innovationsTriggered).toBe(2);
    expect(result.capacityBoostOps).toHaveLength(1);
    // The second breakthrough grows from the deposit the first one left.
    const first = Math.round(500_000 * RD_CAPACITY_BOOST_MIN_PCT);
    const second = Math.round((500_000 + first) * RD_CAPACITY_BOOST_MIN_PCT);
    expect(result.capacityBoostOps[0].updateOne.update.$inc["resources.iron"]).toBe(first + second);

    // With a seed of 170k the ceiling is 510k: the pair cannot add more than 10k.
    const capped = processRdInnovations(
      lookups,
      6,
      now,
      () => 0,
      false,
      seeds({ "US-MN": { iron: 170_000 } })
    );
    expect(capped.capacityBoostOps[0].updateOne.update.$inc["resources.iron"]).toBe(10_000);
  });

  it("uses the reset preset's seeded deposits by default", () => {
    // JP:CHU is seeded with 150k of oil after headroom, a 450k ceiling.
    const corp = makeCorp({ rdScore: 200, type: "extraction", countryId: "JP" });
    const sector = makeSector(corp._id, {
      sectorType: "extraction",
      strategyId: "oil_gas",
      countryId: "JP",
      stateId: "CHU",
    });
    const grown = (oil: number) => {
      const cap = new Map<string, Partial<Record<ExtractableResource, number>>>();
      cap.set("CHU", { oil, natural_gas: 169_153_847 });
      const lookups = baseLookups([corp], [sector], { stateResourceCapacity: cap });
      constrain(lookups, sector, "oil");
      return processRdInnovations(lookups, 6, now).capacityBoostOps[0]?.updateOne.update.$inc;
    };
    expect(grown(200_000)).toEqual({
      "resources.oil": Math.round(200_000 * RD_CAPACITY_BOOST_MIN_PCT),
    });
    expect(grown(58_619_666)).toBeUndefined();
  });

  it("skips sending notifications when the CEO slot is vacant", async () => {
    const { createNotifications } = await import("@/lib/notifications");
    const corp = makeCorp({ rdScore: 200, ceoVacant: true });
    const sector = makeSector(corp._id);
    const result = processRdInnovations(baseLookups([corp], [sector]), 6, now);

    expect(result.innovationsTriggered).toBe(1);
    expect(createNotifications).not.toHaveBeenCalled();
  });
});
