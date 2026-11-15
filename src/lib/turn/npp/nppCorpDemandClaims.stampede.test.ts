/** Two NPPs in one pass must not both found into a gap that fits one plant. */
import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  makeNppCorpDecision,
  processNppCorporationDecisions,
} from "@/lib/turn/nppCorporationBehavior";
import { ceoArchetypeModifiers } from "@/lib/turn/ceoArchetype";
import { getStrategy } from "@/lib/constants/sectorStrategies";
import {
  COMMODITY_BASE_PRICES,
  commodityMixWeight,
  type CommodityType,
} from "@/lib/constants/commodities";
import { CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import { foundingStarterUnits } from "@/lib/corporations/foundingPlant";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import { glutStaggerEligible } from "./cohort";
import { candidate, candidatesByCountry, demandSignals } from "./__fixtures__/marketCandidates";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
beforeEach(() => vi.restoreAllMocks());

const TURN = 25;
const STARTER = foundingStarterUnits("manufacturing");

const plants = {
  enabled: true,
  eraUnitScale: 1,
  year: CAPACITY_ANCHOR_YEAR,
  preset: "2019-default",
  primeRateOf: () => 0,
  costOfLivingOf: () => null,
};

function decisionCorp(): Corporation {
  return {
    _id: new ObjectId(),
    countryId: "US",
    type: "manufacturing",
    headquartersState: "NY",
    liquidCapital: 500_000_000,
    ceoType: "npp",
  } as unknown as Corporation;
}

function decisionSector(): CorporateSector {
  return {
    _id: new ObjectId(),
    sectorType: "technology",
    countryId: "US",
    stateId: "NY",
    revenue: 10_000_000,
    profitMargin: 30,
    effectiveProfitMargin: 30,
    targetGrowthRate: 2,
  } as unknown as CorporateSector;
}

it("a claim from the first founding leaves the second corp a gap too small for a plant", () => {
  // Unmet demand fits exactly one starter plant at the founding share (half the gap).
  const signals = demandSignals({ "NY:manufacturing": STARTER * 2 });
  const found = () => {
    const decision = makeNppCorpDecision(
      {
        corp: decisionCorp(),
        sectors: [decisionSector()],
        turn: TURN,
        now: new Date(),
        modifiers: ceoArchetypeModifiers("cautious"),
      },
      candidatesByCountry([candidate({ stateId: "NY" })]),
      new Set<string>(),
      () => null,
      plants,
      signals
    );
    // The shell applies claims only for the decision it keeps.
    for (const claim of decision.demandClaims ?? []) signals.claimDemandUnits!(claim, claim.units);
    return decision;
  };

  const first = found();
  const second = found();
  expect(first.newSectors).toHaveLength(1);
  expect(first.newSectors![0].starterOrder!.unitsOrdered).toBe(STARTER);
  expect(second.newSectors).toBeUndefined();
});

it("the pass applies each kept founding as a claim, so one gap admits one entrant", async () => {
  const memory = createInMemoryDb();
  const db = memory as unknown as Db;
  vi.mocked(getDb).mockResolvedValue(db);
  const ids: ObjectId[] = [];
  for (let n = 1; ids.length < 2; n++) {
    const id = new ObjectId(n.toString(16).padStart(24, "0"));
    if (glutStaggerEligible(id.toHexString(), TURN)) ids.push(id);
  }
  memory.seed("gameConfig", [{ _id: "default", marketSystemMode: "plants" }]);
  memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: TURN - 1,
      currentYear: 2019,
      startingYear: 2019,
      preset: "2019-default",
      nppCorpStrategyEnabled: false,
    },
  ]);
  memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  memory.seed(
    "corporations",
    ids.map((id) => ({
      _id: id,
      name: `Synthetic ${id}`,
      countryId: "US",
      type: "manufacturing",
      headquartersState: "NY",
      liquidCurrencyCode: "USD",
      liquidCapital: 100_000_000,
      ceoType: "npp",
    }))
  );
  memory.seed(
    "corporateSectors",
    ids.map((id) => ({
      _id: new ObjectId(),
      corporationId: id,
      sectorType: "technology",
      countryId: "US",
      stateId: "NY",
      revenue: 1_000_000,
      realizedRevenue: 1_000_000,
      profitMargin: 30,
      effectiveProfitMargin: 30,
      targetGrowthRate: 2,
      capitalStock: 1000,
      producedUnits: 1000,
      soldUnits: 1000,
      soldFraction: 1,
    }))
  );
  memory.seed("states", [{ _id: "NY", countryId: "US", gdp: 1 }]);
  const mix = getStrategy("manufacturing", "").supply;
  const gapUnits = STARTER * 2.2;
  memory.seed(
    "commodityPrices",
    (Object.keys(mix) as CommodityType[]).map((commodity) => ({
      _id: new ObjectId(),
      commodity,
      turn: TURN - 1,
      currentPrice: COMMODITY_BASE_PRICES[commodity],
      // One sector unit splits across the mix; the gap is stated in commodity units.
      nationalDemand: {
        US: gapUnits * commodityMixWeight(mix, COMMODITY_BASE_PRICES, commodity),
      },
      nationalSupply: { US: 0 },
      stateDemand: { NY: gapUnits * commodityMixWeight(mix, COMMODITY_BASE_PRICES, commodity) },
      stateSupply: { NY: 0 },
    }))
  );

  const result = await processNppCorporationDecisions(db, TURN, new Date(), false);

  const foundedInManufacturing = result.newSectors.filter((s) => s.sectorType === "manufacturing");
  expect(foundedInManufacturing).toHaveLength(1);
});
