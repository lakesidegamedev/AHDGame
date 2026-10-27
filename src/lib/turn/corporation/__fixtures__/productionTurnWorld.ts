/**
 * Synthetic corporation-turn world at production scale.
 *
 * The live world runs about 2,000 corporations and 14,000 sectors through
 * `processSectors` every turn. Unit tests cover single sectors; this fixture
 * covers the shape of the whole loop, so a CPU profile taken here points at the
 * same functions the live turn spends its time in. It builds plain documents
 * and lookup maps only, with no database and no clock reads.
 *
 * Everything is derived from a seed, so a golden capture recorded against one
 * run compares exactly against the next.
 */
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_TYPES,
  type CommodityType,
} from "@/lib/constants/commodities";
import type { CorporationType } from "@/lib/constants/corporationsClient";
import { getEffectiveStrategyRates } from "@/lib/constants/sectorStrategies";
import { impliedOutputUnits } from "@/lib/market/capital";
import { buildMarketContext } from "@/lib/market/marketContext";
import type { LabourContext } from "@/lib/labour/laborCost";
import type { CorporationLookups } from "../types";

const PRESET = "2019-default";
const TURN = 1200;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const STATES = [
  "US-CA",
  "US-TX",
  "US-NY",
  "US-IL",
  "US-FL",
  "US-OH",
  "US-PA",
  "US-GA",
  "US-MI",
  "US-NC",
];
/** Types whose plants the fixture gives real capacity and output. */
const OPERATING_TYPES: CorporationType[] = [
  "manufacturing",
  "extraction",
  "retail",
  "financial",
  "agriculture",
  "energy",
  "defense",
  "logistics",
  "chemical_industries",
  "technology",
];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const oid = (n: number) => new ObjectId(n.toString(16).padStart(24, "0"));

export interface ProductionTurnWorld {
  lookups: CorporationLookups;
  market: ReturnType<typeof buildMarketContext>;
  labour: LabourContext;
  turn: number;
  now: Date;
  corporations: Corporation[];
  sectors: CorporateSector[];
}

export interface ProductionTurnWorldOptions {
  corporations: number;
  sectorsPerCorp: number;
  seed?: number;
  /**
   * Give every sector the persisted telemetry a live document carries (sold
   * splits, plant P&L, inventory, shadow revenues). The turn rewrites these
   * every hour, so a production document is several times the size of a bare
   * fixture one, and per-sector object copies cost accordingly. Off by default
   * so the golden capture stays small.
   */
  liveDocumentShape?: boolean;
}

/**
 * Build the world. Sectors per corporation is fixed so the sector index is
 * still derivable from ids, which keeps captures readable when two runs differ.
 */

/**
 * The per-turn telemetry a live sector document accumulates: the sold splits,
 * the physical P&L block, inventory and the legacy shadow revenues. Every field
 * is one the corporation turn itself persists, so the document has production
 * weight without inventing data.
 */
function liveSectorTelemetry(
  sector: CorporateSector,
  dailyRevenue: number,
  turn: number
): Record<string, unknown> {
  const mix = ["steel", "electronics", "energy", "chemicals", "food", "machinery", "services"];
  const sold: Record<string, number> = {};
  const shares: Record<string, number> = {};
  for (const [i, commodity] of mix.entries()) {
    sold[commodity] = 0.5 + i / 20;
    shares[commodity] = 1 / mix.length;
  }
  return {
    soldFraction: 0.92,
    clearingFactor: 0.97,
    effectivePosture: 1,
    soldByCommodity: sold,
    revenueShareByCommodity: shares,
    soldUnitsByCommodity: sold,
    soldByCommodityTurn: turn - 1,
    soldUnitsByCommodityTurn: turn - 1,
    effectiveProfitMargin: sector.profitMargin,
    throughputFactor: 0.93,
    throughputBindingInput: "steel",
    throughputStartTurn: turn - 300,
    laborCost: dailyRevenue * 0.12,
    wagePerWorker: 320,
    unionization: 14,
    workerExpectationIndex: 1.02,
    lowFillTurns: 0,
    capitalBookAnchor: sector.capacityBookAnchor ?? 0,
    otherOpexPerUnitAnchor: 2.5,
    otherOpexAnchorMarginBasis: 0.8,
    legacyRevenueShadow: dailyRevenue * 0.99,
    legacyGrowthRateShadow: 0.4,
    legacyTargetGrowthRateShadow: 0.5,
    plantCrewShare: 0.9,
    demandIdleTurns: 2,
    demandFill: 0.88,
    plantsPnl: {
      costModel: "explicit",
      turn: turn - 1,
      revenue: dailyRevenue,
      inventoryRevenue: 0,
      inventoryCarry: 0,
      inputs: dailyRevenue * 0.31,
      labour: dailyRevenue * 0.12,
      upkeep: dailyRevenue * 0.02,
      compliance: dailyRevenue * 0.01,
      otherOpex: dailyRevenue * 0.08,
      otherOpexCreditCapped: 0,
      otherOpexUncapped: 0,
      financialLegs: dailyRevenue * 0.03,
      internalSupplyDiscountCost: 0,
      policyCredit: 0,
      policyPp: 0,
      operatingCost: dailyRevenue * 0.57,
      totalCost: dailyRevenue * 0.57,
      profit: dailyRevenue * 0.2,
    },
    inventoryUnits: { steel: 12, electronics: 3 },
    inventoryValueAnchor: 480,
    inventoryDrainedUnits: 2,
    inventorySpoiledUnits: 0,
    deliveryLimitedFraction: 0,
    deliveryLimitedFreightClass: null,
    freightBillingCharge: 0,
    freightBillingCredit: 0,
  };
}

export function buildProductionTurnWorld(options: ProductionTurnWorldOptions): ProductionTurnWorld {
  const { corporations: corpCount, sectorsPerCorp, seed = 7, liveDocumentShape = false } = options;
  const rnd = mulberry32(seed);
  const corporations: Corporation[] = [];
  const sectors: CorporateSector[] = [];
  const sectorsByCorp = new Map<string, CorporateSector[]>();
  const corpById = new Map<string, Corporation>();
  const marketShareBySectorId = new Map<string, number>();
  const nationalDominanceShareBySectorId = new Map<string, number>();
  const extractionCapacityUtilBySector = new Map<
    string,
    { utilization: number; bindingResource: "oil" | "iron_ore" | null }
  >();

  for (let c = 0; c < corpCount; c++) {
    const corpId = oid(100_000 + c);
    const type = OPERATING_TYPES[c % OPERATING_TYPES.length]!;
    const stateId = STATES[c % STATES.length]!;
    const corp: Corporation = {
      _id: corpId,
      name: `Fixture Corp ${c}`,
      type,
      secondaryType: null,
      typeSwitchTurn: null,
      countryId: "US",
      headquartersState: stateId,
      liquidCapital: 5_000_000 + Math.floor(rnd() * 20_000_000),
      liquidCurrencyCode: "USD",
      marketingBudget: Math.floor(rnd() * 240_000),
      marketingStrength: 20 + rnd() * 60,
      logisticsBudget: Math.floor(rnd() * 120_000),
      logisticsStrength: 20 + rnd() * 60,
      rdBudget: Math.floor(rnd() * 240_000),
      ceoId: oid(500_000 + c),
      ceoType: c % 5 === 0 ? "player" : "npp",
      userId: null,
      totalShares: 10_000_000,
      sharePrice: 1 + rnd(),
      shareholders: [
        { corporationId: oid(100_000 + ((c + 1) % corpCount)), shares: 1_000_000 },
        { characterId: oid(500_000 + c), shares: 2_000_000 },
      ],
      dividendRate: c % 3 === 0 ? 0.02 : 0,
      ceoSalary: c % 4 === 0 ? 240_000 : 0,
      internalSupplyPolicy: {
        priority: c % 3 === 0 ? "own" : "market",
        discount: c % 3 === 0 ? 0.1 : 0,
      },
      createdAt: NOW,
      updatedAt: NOW,
    } as unknown as Corporation;
    corporations.push(corp);
    corpById.set(corpId.toString(), corp);
    const corpSectors: CorporateSector[] = [];

    for (let s = 0; s < sectorsPerCorp; s++) {
      const sectorId = oid(1_000_000 + c * sectorsPerCorp + s);
      const sectorType = (c + s) % 11 === 0 ? "extraction" : type;
      const state = STATES[(c + s) % STATES.length]!;
      const supply = getEffectiveStrategyRates(sectorType, "standard", undefined, undefined, 0)
        .supply as Partial<Record<CommodityType, number>>;
      const dailyRevenue = 120_000 + Math.floor(rnd() * 480_000);
      const capacityUnits = Math.max(
        1,
        impliedOutputUnits(dailyRevenue, supply, COMMODITY_BASE_PRICES, 1)
      );
      const sector: CorporateSector = {
        _id: sectorId,
        corporationId: corpId,
        countryId: "US",
        stateId: state,
        sectorType,
        strategyId: "standard",
        transitionFromStrategyId: null,
        transitionStartTurn: null,
        revenue: dailyRevenue,
        profitMargin: 10 + rnd() * 25,
        effectiveProfitMargin: 10 + rnd() * 25,
        workers: 40 + Math.floor(rnd() * 400),
        targetGrowthRate: rnd() < 0.5 ? 0 : rnd() * 4,
        currentGrowthRate: rnd() * 2,
        currentGrowthCost: 0,
        productionPolicyLevel: (c + s) % 7 === 0 ? 1 : 0,
        capitalStock: capacityUnits * 1.1,
        operatingCapacityUnits: capacityUnits * 1.1,
        capacityUnits,
        producedUnits: capacityUnits * 0.82,
        plantsStartTurn: TURN - 400,
        clearingStartTurn: TURN - 300,
        throughputStartTurn: TURN - 300,
        capacityHaircutStartTurn: TURN - 500,
        plantsPnl: { turn: TURN - 1, revenue: dailyRevenue, profit: dailyRevenue * 0.2 },
        activeCapacityPercent: 100,
        demandThrottleFactor: 0.95,
        buildQueue: [],
        inventoryUnits: { [Object.keys(supply)[0] ?? "steel"]: 12 },
        createdAt: NOW,
        updatedAt: NOW,
      } as unknown as CorporateSector;
      if (liveDocumentShape) Object.assign(sector, liveSectorTelemetry(sector, dailyRevenue, TURN));
      corpSectors.push(sector);
      sectors.push(sector);
      const share = 1 / sectorsPerCorp;
      marketShareBySectorId.set(sectorId.toString(), share * 100);
      nationalDominanceShareBySectorId.set(sectorId.toString(), share * 40);
      if (sectorType === "extraction") {
        extractionCapacityUtilBySector.set(sectorId.toString(), {
          utilization: 0.9,
          bindingResource: "oil",
        });
      }
    }
    sectorsByCorp.set(corpId.toString(), corpSectors);
  }

  const exchangeRatesByCurrency = new Map([
    ["USD", 1],
    ["EUR", 1.08],
    ["GBP", 1.27],
  ] as const);
  const stateCountryMap = new Map(STATES.map((state) => [state, "US"]));
  const stateSectorSpecializationByState = new Map(
    STATES.map((state, i) => [
      state,
      {
        primary: OPERATING_TYPES[i % OPERATING_TYPES.length]! as never,
        secondary: OPERATING_TYPES[(i + 1) % OPERATING_TYPES.length]! as never,
      },
    ])
  );
  const globalCommodityBalances = new Map(
    COMMODITY_TYPES.map((commodity, i) => [
      commodity,
      { supply: 1_000_000 + i * 10_000, demand: 980_000 + i * 10_000 },
    ])
  );
  const priceRatioByCommodity = new Map(COMMODITY_TYPES.map((c) => [c, 1 + (c.length % 5) * 0.01]));
  const rawStateBalances = new Map(
    STATES.map((state, i) => [
      state,
      new Map(
        COMMODITY_TYPES.map((commodity, j) => [
          commodity,
          { supply: 100_000 + i * 1_000 + j, demand: 98_000 + i * 1_000 + j },
        ])
      ),
    ])
  );
  const stateInputAvailabilityByState = new Map(
    STATES.map((state) => [
      state,
      new Map(COMMODITY_TYPES.slice(0, 12).map((commodity) => [commodity, 0.95])) as Map<
        CommodityType,
        number
      >,
    ])
  );
  const stateMetricValue = (state: string, base: number) => base + (state.length % 5);

  // One internal supply link and one group receipt per handful of corporations,
  // so the prepass and the discount settlement run at production shape.
  const internalSupplyTrades = sectors
    .filter((_, index) => index % 20 === 0)
    .map((buyerSector, i) => {
      const sellerSector = sectors[(i * 37 + 11) % sectors.length]!;
      return {
        supplierSectorId: sellerSector._id.toString(),
        buyerSectorId: buyerSector._id.toString(),
        supplierCorpId: sellerSector.corporationId.toString(),
        buyerCorpId: buyerSector.corporationId.toString(),
        commodity: (i % 2 === 0 ? "steel" : "oil") as CommodityType,
        units: 100 + i,
        discount: 0.05,
        marketPrice: 12.5,
      };
    });
  const internalSupplyCommittedInputsBySectorId = new Map(
    internalSupplyTrades.map((trade) => [
      trade.buyerSectorId,
      new Map([[trade.commodity, trade.units]]) as Map<string, number>,
    ])
  );
  const groupSupplyReceipts = corporations.slice(0, 4).map((corp, i) => ({
    supplierId: corp._id.toString(),
    supplierSectorId: sectorsByCorp.get(corp._id.toString())?.[1]?._id.toString() ?? "seller",
    buyerId: corporations[(i + 2) % corpCount]!._id.toString(),
    buyerSectorId:
      sectorsByCorp.get(corporations[(i + 2) % corpCount]!._id.toString())?.[0]?._id.toString() ??
      "buyer",
    commodity: "steel",
    units: 50 + i,
    amountAnchor: 1_000 + i,
    discount: i === 0 ? 0 : 0.05,
  }));

  const market = {
    ...buildMarketContext("plants"),
    explicitPlantCostsEnabled: true,
    commodityFixStage: 4,
    marketRecoveryStage: 1,
    internalSupplyTrades,
    internalSupplyCommittedInputsBySectorId,
    groupSupplyReceipts,
    groupSupplyCommittedInputsBySector: new Map(),
    groupSupplyCommittedOutputsBySector: new Map(),
    advertisingSellerDeliveredValueAnchorByCorpId: new Map([
      [corporations[0]!._id.toString(), 50_000],
      [corporations[1]!._id.toString(), 25_000],
    ]),
    freightBillingChargeBySectorId: new Map(
      sectors.slice(0, 200).map((sector, i) => [sector._id.toString(), 1_000 + i])
    ),
    freightBillingCreditBySectorId: new Map(
      sectors.slice(0, 200).map((sector, i) => [sector._id.toString(), 400 + i / 2])
    ),
  };

  const lookups: CorporationLookups = {
    preset: PRESET,
    engineSixCountries: new Set(["US"]),
    managementOverheadPpByCorpId: new Map(corporations.map((corp) => [corp._id.toString(), 0.2])),
    corporations,
    sectorsByCorp,
    corpById,
    ceoBusinessAcumenByCorpId: new Map(
      corporations.filter((c) => c.ceoType === "player").map((c) => [c._id.toString(), 30])
    ),
    bondsByCorpId: new Map(),
    bondsHeldByCorpId: new Map(),
    portfolioAnchorValueByCorpId: new Map(),
    bondAndImfPortfolioAnchorByCorpId: new Map(),
    issuedBondDebtByCorpId: new Map(),
    crossCorpStockHoldingsByHolderCorpId: new Map(),
    primeRateByCountry: new Map([["US", 3.5]]),
    primeRateSmoothedByCountry: new Map([["US", 3.4]]),
    macroInflationByCountry: new Map([["US", 2.1]]),
    investorConfidenceByCountry: new Map([["US", 55]]),
    macroDebtToGdpByCountry: new Map([["US", 0.9]]),
    macroDeficitByCountry: new Map([["US", 0.04]]),
    sovereignDefaultMarginByCorpId: new Map(),
    unemploymentByState: new Map(STATES.map((s) => [s, 4 + (s.length % 3)])),
    gridReliabilityByState: new Map(STATES.map((s) => [s, 0.95])),
    corruptionByState: new Map(STATES.map((s) => [s, 0.1])),
    workforceSkillByState: new Map(STATES.map((s) => [s, 0.6])),
    rawWorkforceSkillByState: new Map(STATES.map((s) => [s, 0.6])),
    labourTightnessByState: new Map(STATES.map((s) => [s, 0.4])),
    crimeRateByState: new Map(STATES.map((s) => [s, 0.05])),
    broadbandByState: new Map(STATES.map((s) => [s, 0.8])),
    roadConditionByState: new Map(STATES.map((s) => [s, 0.7])),
    carbonEmissionsByState: new Map(STATES.map((s) => [s, 1])),
    costOfLivingByState: new Map(STATES.map((s) => [s, 100])),
    globalCommodityBalances,
    priceRatioByCommodity,
    landedPremiumByState: new Map(),
    nationalCommodityBalancesByCountry: new Map([["US", globalCommodityBalances]]),
    countryClearingBooks: null,
    exportIntensityByCountry: new Map([["US", new Map(COMMODITY_TYPES.map((c) => [c, 0.2]))]]),
    rawStateBalances,
    sectorPresenceKeys: new Set(
      sectors.map((sector) => `${sector.stateId}|${sector.sectorType}|${sector.corporationId}`)
    ),
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
    domesticCorpTaxRateByCountry: new Map([["US", 0.21]]),
    foreignCorpTaxRateByCountry: new Map([["US", 0.21]]),
    domesticStateCorpTaxRateByState: new Map(STATES.map((s) => [s, 0.05])),
    foreignStateCorpTaxRateByState: new Map(STATES.map((s) => [s, 0.05])),
    exchangeRatesByCurrency,
    stateCountryMap,
    stateResourceCapacityByState: new Map(
      STATES.map((s) => [s, { oil: 1_000_000, iron_ore: 500_000, coal: 800_000 }])
    ),
    extractionCapacityUtilBySector,
    marketShareBySectorId,
    nationalDominanceShareBySectorId,
    stateSectorSpecializationByState,
    activeDisasterEffectsByState: new Map(),
    stateInputAvailabilityByState,
    statePriceRatioByState: new Map(
      STATES.map((s) => [s, new Map(COMMODITY_TYPES.map((c) => [c, 1.02]))])
    ),
    reachableInputPriceRatiosByCountry: new Map([
      ["US", new Map(COMMODITY_TYPES.map((c) => [c, 1.01]))],
    ]),
    reachablePriceRatioByCountry: new Map([["US", new Map(COMMODITY_TYPES.map((c) => [c, 1.03]))]]),
    latentDemandFactorByCommodity: new Map(COMMODITY_TYPES.map((c) => [c, 1.1])),
    unmetForeignDemandByCountry: new Map(),
    stateMetricsByState: new Map(
      STATES.map((s) => [
        s,
        {
          economic: {
            costOfLiving: { value: 100 + (s.length % 5) },
            unemploymentRate: { value: 4 + (s.length % 3) },
            gdp: { value: stateMetricValue(s, 1e9) },
          },
          social: { education: { value: 60 } },
        },
      ]) as never
    ),
    politicalBoardByState: new Map(
      STATES.map((s) => [s, { labour_rights: stateMetricValue(s, 50) } as never])
    ),
    marginLevelTrimPp: 0,
    freightChargesByDestState: new Map(
      STATES.map((s) => [
        s,
        new Map([
          ["steel", 12_000],
          ["oil", 8_000],
        ]),
      ])
    ),
    freightHaulRevenueByOriginState: new Map(STATES.map((s) => [s, 6_000])),
    freightDemandByDestState: new Map(
      STATES.map((s) => [
        s,
        new Map([
          ["steel", 20_000],
          ["oil", 15_000],
        ]),
      ])
    ),
    freightUnitPriceByDestState: new Map(
      STATES.map((s) => [
        s,
        new Map([
          ["steel", 12.5],
          ["oil", 30],
        ]),
      ])
    ),
    freightSupplyByOriginState: new Map(STATES.map((s) => [s, 9_000])),
    ownRouteFreightByCorp: new Map(),
    ownRouteGroupMembersByRoot: new Map(),
  } as unknown as CorporationLookups;

  const labour: LabourContext = {
    wagesEnabled: true,
    unionsEnabled: true,
    fullEnabled: false,
    minWageRatioByCountry: new Map([["US", 0.3]]),
  };

  return { lookups, market, labour, turn: TURN, now: NOW, corporations, sectors };
}
