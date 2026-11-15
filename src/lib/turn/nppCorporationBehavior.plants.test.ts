/**
 * P3b: NPP founding parity under plants.
 *
 * Under plants both sides price the founding build through `computeBuildCost`
 * with the founding discount, size it from the bucket's unmet demand, and claim
 * the founded units against that demand instead of minting room.
 *
 * The non-plants path (no plants context) must be byte-identical to before.
 */
import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { NPP_FOUNDING_UNMET_SHARE } from "./npp/rules/marketSaturation";
import { MAX_BUILD_UNITS_PER_ORDER } from "@/lib/constants/capacityEconomy";
import { candidate, candidatesByCountry, demandSignals } from "./npp/__fixtures__/marketCandidates";
import type { MarketCandidate } from "./npp/marketCandidates";
import {
  makeNppCorpDecision,
  type CommodityPriceRatioFn,
  type NppPlantsContext,
} from "./nppCorporationBehavior";
import { ceoArchetypeModifiers } from "./ceoArchetype";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import {
  CAPACITY_ANCHOR_YEAR,
  CAPACITY_BUILD_TURNS,
  computeBuildCost,
} from "@/lib/constants/capacityEconomy";
import { foundingStarterUnits, sectorEntryFeeAnchor } from "@/lib/corporations/foundingPlant";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";

const noPrices: CommodityPriceRatioFn = () => null;
const noState = new Set<string>();
const TURN = 100;

/** Unmet demand in the bucket the corp will expand into: manufacturing, in-country. */
const ROOM_UNITS = foundingStarterUnits("manufacturing") * 40;

const MANUFACTURING_CA = candidate({ stateId: "CA" });
const roomSignals = (room = ROOM_UNITS, stateId = "CA") =>
  demandSignals({ [`${stateId}:manufacturing`]: room });

/**
 * A corp healthy enough to clear every generic expansion gate (profitable,
 * strong margin, cash well above the floor) whose ONLY sector is `technology`,
 * so `manufacturing` is a non-overlapping expansion target.
 */
function corp(overrides: Partial<Corporation> = {}): Corporation {
  return {
    _id: new ObjectId(),
    countryId: "US",
    type: "manufacturing",
    headquartersState: "CA",
    liquidCapital: 500_000_000,
    ceoType: "npp",
    ...overrides,
  } as unknown as Corporation;
}

function sector(overrides: Partial<CorporateSector> = {}): CorporateSector {
  return {
    _id: new ObjectId(),
    sectorType: "technology",
    countryId: "US",
    stateId: "CA",
    revenue: 10_000_000,
    profitMargin: 30,
    effectiveProfitMargin: 30,
    targetGrowthRate: 2,
    ...overrides,
  } as unknown as CorporateSector;
}

const plantsCtx: NppPlantsContext = {
  enabled: true,
  eraUnitScale: 1,
  year: CAPACITY_ANCHOR_YEAR,
  preset: "2019-default",
  primeRateOf: () => 0,
  costOfLivingOf: () => null,
};

const plants1953Ctx: NppPlantsContext = {
  enabled: true,
  eraUnitScale: getEraUnitScale("1953-default"),
  year: 1960,
  preset: "1953-default",
  primeRateOf: () => 5,
  costOfLivingOf: () => 100,
};

function decide(
  c: Corporation,
  sectors: CorporateSector[],
  candidates: MarketCandidate[],
  plants?: NppPlantsContext,
  signals = roomSignals()
) {
  return makeNppCorpDecision(
    {
      corp: c,
      sectors,
      turn: TURN,
      now: new Date(),
      modifiers: ceoArchetypeModifiers("cautious"),
    },
    candidatesByCountry(candidates),
    noState,
    noPrices,
    plants,
    signals
  );
}

/**
 * Founding build a neutral, cash-ample NPP should be charged. Deployment
 * scales to available capital, so with the default 500M-liquid corp the bind is
 * the unmet-demand share, not a single facility. Floored at one facility.
 */
const EXPECTED_UNITS = Math.max(
  foundingStarterUnits("manufacturing"),
  Math.floor(Math.min(ROOM_UNITS * NPP_FOUNDING_UNMET_SHARE, MAX_BUILD_UNITS_PER_ORDER))
);
const EXPECTED_FEE = sectorEntryFeeAnchor("2019-default");
const EXPECTED_BUILD = computeBuildCost({
  strategyId: null,
  eraUnitScale: 1,
  sectorType: "manufacturing",
  units: EXPECTED_UNITS,
  year: CAPACITY_ANCHOR_YEAR,
  marketSharePercent: 0,
  primeRate: 0,
  founding: true,
}).totalAnchor;

describe("NPP expansion under plants — price parity", () => {
  it("uses the real era-priced founding quote instead of a modern flat cash gate", () => {
    const c = corp({ liquidCapital: 10_000 });
    const decision = decide(
      c,
      [sector({ revenue: 1_000, realizedRevenue: 1_000 })],
      [MANUFACTURING_CA],
      plants1953Ctx
    );

    expect(decision.newSectors).toHaveLength(1);
    const spent = -decision.liquidCapitalDelta;
    // Era-real pricing keeps a 1953 founding cheap. Deployment now scales to
    // capital, so a 10k treasury funds several facilities rather than one — but
    // it stays a bounded share of that treasury and nowhere near the old flat
    // 500k modern cash gate.
    expect(spent).toBeGreaterThan(0);
    expect(spent).toBeLessThan(c.liquidCapital as number);
    expect(spent).toBeLessThan(50_000);
  });

  it("uses canonical physical P&L to block a loss-making expansion", () => {
    const losing = sector({
      plantsPnl: {
        revenue: 1_000,
        inventoryRevenue: 0,
        inventoryCarry: 0,
        inputs: 700,
        labour: 300,
        upkeep: 100,
        compliance: 0,
        otherOpex: 0,
        financialLegs: 0,
        policyCredit: 0,
        policyPp: 0,
        operatingCost: 1_000,
        totalCost: 1_100,
        profit: -100,
        turn: TURN - 1,
      },
    });
    const decision = decide(corp(), [losing], [MANUFACTURING_CA], plantsCtx);

    expect(decision.newSectors).toBeUndefined();
  });

  it("keeps a shareholder return while funding productive investment", () => {
    const decision = decide(corp({ dividendRate: 8 }), [sector()], [MANUFACTURING_CA], plantsCtx);

    expect(decision.newSectors).toHaveLength(1);
    expect(decision.updates.dividendRate as number).toBeGreaterThan(0);
  });

  it("charges the entry fee plus a real founding build, not a flat 500k", () => {
    const c = corp();
    const decision = decide(c, [sector()], [MANUFACTURING_CA], plantsCtx);

    expect(decision.newSectors).toHaveLength(1);
    const spent = -decision.liquidCapitalDelta;
    expect(spent).toBeCloseTo(EXPECTED_FEE + EXPECTED_BUILD, 2);
    expect(spent).not.toBeCloseTo(500_000, 2);
  });

  it("queues the capacity instead of granting it", () => {
    const decision = decide(corp(), [sector()], [MANUFACTURING_CA], plantsCtx);
    const order = decision.newSectors![0].starterOrder!;
    expect(order.unitsOrdered).toBeCloseTo(EXPECTED_UNITS, 6);
    expect(order.costPaidAnchor).toBeCloseTo(EXPECTED_BUILD, 2);
    expect(order.startTurn).toBe(TURN);
    expect(order.onlineTurn).toBe(TURN + CAPACITY_BUILD_TURNS("manufacturing", true));
  });

  it("claims the founded capacity against the bucket's unmet demand", () => {
    const decision = decide(corp(), [sector()], [MANUFACTURING_CA], plantsCtx);
    expect(decision.demandClaims).toEqual([
      {
        stateId: "CA",
        sectorType: "manufacturing",
        units: EXPECTED_UNITS,
        countryId: "US",
      },
    ]);
  });

  it("scales the founding build to capital instead of a single facility (the $2M-one-plant fix)", () => {
    // The bug: an NPP sitting on cash founded a new sector with exactly one
    // facility and idled the rest, while a player deploys their treasury into
    // dozens of plants. Founding now sizes to a bounded share of surplus.
    const c = corp({ liquidCapital: 2_000_000 });
    const decision = decide(c, [sector()], [MANUFACTURING_CA], plantsCtx);
    const order = decision.newSectors![0].starterOrder!;
    // Many facilities, not one.
    expect(order.unitsOrdered).toBeGreaterThan(foundingStarterUnits("manufacturing"));
    // Bounded by the unmet-demand share so it cannot vacuum a fresh market.
    expect(order.unitsOrdered).toBeLessThanOrEqual(
      Math.floor(ROOM_UNITS * NPP_FOUNDING_UNMET_SHARE)
    );
    // Never spent below the cash floor.
    expect((c.liquidCapital ?? 0) + decision.liquidCapitalDelta).toBeGreaterThan(0);
  });

  it("pays the same price a player's founding build pays for the same units", () => {
    // Parity with `expandSector`: same function, same discount, same inputs.
    const decision = decide(corp(), [sector()], [MANUFACTURING_CA], plantsCtx);
    const order = decision.newSectors![0].starterOrder!;
    const playerPrice = computeBuildCost({
      strategyId: null,
      eraUnitScale: 1,
      sectorType: "manufacturing",
      units: order.unitsOrdered,
      year: CAPACITY_ANCHOR_YEAR,
      marketSharePercent: 0,
      primeRate: 0,
      founding: true,
    }).totalAnchor;
    expect(order.costPaidAnchor).toBeCloseTo(playerPrice, 6);
  });

  it("refuses when the market has no unmet demand for one facility", () => {
    const decision = decide(
      corp(),
      [sector()],
      [MANUFACTURING_CA],
      plantsCtx,
      roomSignals(foundingStarterUnits("manufacturing") * 0.5)
    );

    expect(decision.newSectors).toBeUndefined();
    expect(decision.demandClaims).toBeUndefined();
    expect(decision.liquidCapitalDelta).toBe(0);
  });

  it("founds in a bucket that has no stored document at all", () => {
    const decision = decide(
      corp(),
      [sector()],
      [candidate({ stateId: "TX" })],
      plantsCtx,
      roomSignals(ROOM_UNITS, "TX")
    );
    expect(decision.newSectors![0].stateId).toBe("TX");
  });

  it("ranks candidate markets by unmet demand, not by any stored revenue", () => {
    const thin = candidate({ stateId: "NY" });
    const deep = candidate({ stateId: "TX" });
    // HQ state is WA and neither candidate is there, so ranking decides.
    const c = corp({ headquartersState: "WA" });
    const decision = decide(
      c,
      [sector()],
      [thin, deep],
      plantsCtx,
      demandSignals({
        "NY:manufacturing": ROOM_UNITS * 0.1,
        "TX:manufacturing": ROOM_UNITS * 50,
      })
    );
    expect(decision.newSectors![0].stateId).toBe("TX");
  });
});

describe("NPP growth targets under plants — retired", () => {
  const growthWritesOf = (d: ReturnType<typeof decide>) =>
    d.sectorUpdates.filter((u) => "targetGrowthRate" in (u.update.$set ?? {}));

  it("emits no targetGrowthRate updates under plants, even for a loss-making sector", () => {
    // Loss margin forces a write without plants (2 → 0), so silence here
    // proves the section-2 skip rather than a quiet governor.
    const losing = sector({
      targetGrowthRate: 2,
      profitMargin: -5,
      effectiveProfitMargin: -5,
    });
    const decision = decide(corp(), [losing], [MANUFACTURING_CA], plantsCtx);
    expect(growthWritesOf(decision)).toHaveLength(0);
  });

  it("still governs growth targets without plants", () => {
    const losing = sector({
      targetGrowthRate: 2,
      profitMargin: -5,
      effectiveProfitMargin: -5,
    });
    const decision = decide(corp(), [losing], [MANUFACTURING_CA]);
    expect(growthWritesOf(decision).length).toBeGreaterThan(0);
  });
});

describe("NPP expansion without plants", () => {
  it("still pays the flat 500k and receives a starter nameplate", () => {
    const c = corp();
    const decision = decide(c, [sector()], [MANUFACTURING_CA]);

    expect(decision.newSectors).toHaveLength(1);
    expect(decision.newSectors![0].starterOrder).toBeUndefined();
    expect(decision.newSectors![0].revenue).toBeGreaterThan(0);
    expect(-decision.liquidCapitalDelta).toBe(500_000);
    expect(decision.demandClaims).toBeUndefined();
  });
});
