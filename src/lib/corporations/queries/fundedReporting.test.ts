import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { buildSectorDetails, getEmptyStateMetricValues } from "./corporationDetail/sectorRows";
import { computeSectorMarginSection } from "./sectorDetailSections";

const sector = {
  _id: new ObjectId(),
  corporationId: new ObjectId(),
  countryId: "US",
  stateId: "NY",
  sectorType: "energy",
  revenue: 1000,
  realizedRevenue: 0,
  effectiveProfitMargin: 0,
  profitMargin: 30,
  currentGrowthCost: 0,
  targetGrowthRate: 0,
  currentGrowthRate: 0,
  capitalStock: 100,
  producedUnits: 100,
  soldUnits: 0,
  workers: 10,
  freightBillingCharge: 24,
  plantsPnl: {
    source: "funded",
    revenue: 0,
    profit: -900,
    totalCost: 900,
    compliance: 0,
    stockAddedAtCost: 800,
    transitionSupport: 50,
  },
} as CorporateSector;
const corporation = {
  _id: sector.corporationId,
  countryId: "US",
  headquartersState: "NY",
  type: "energy",
  secondaryType: null,
};
const maps = () => new Map();

describe("funded zero-sales profit read paths", () => {
  it.each([0, 20])("sector detail preserves the booked loss with %s growth cost", (growth) => {
    const result = computeSectorMarginSection({
      sector: { ...sector, currentGrowthCost: growth },
      sectorType: "energy",
      sectorCountryId: "US",
      corporation,
      state: null,
      stateMetrics: null,
      gameState: null,
      metrics: getEmptyStateMetricValues(),
      macroEcon: {},
      currentTurn: 1,
      totalCorpSectors: 1,
      marketShare: 1,
      allTariffs: [],
      activeFtaPairs: new Set(),
      ftaCoverage: {
        byCountryEconomyWide: maps(),
        bySectorType: maps(),
        corpHqByCorpId: maps(),
        pairs: new Set(),
      },
      activeSubsidies: [],
      tariffBlend: { globalWeight: 1, nationalWeight: 0, localWeight: 0 },
      effectiveSupply: {},
      effectiveRates: { supply: {}, demand: {}, isTransitioning: false },
      globalBalances: maps(),
      nationalBalancesByCountry: maps(),
      stateBalances: maps(),
    } as unknown as Parameters<typeof computeSectorMarginSection>[0]);
    expect(result.maintenance).toBe(900 - growth);
    expect(result.profit).toBe(-924);
    expect(result.enginePnl).toBeNull();
  });

  it.each([0, 20])("corporation summary reconciles booked costs with %s growth cost", (growth) => {
    const result = buildSectorDetails({
      corporation,
      sectors: [{ ...sector, currentGrowthCost: growth }],
      currentTurn: 1,
      plantsMode: true,
      labourWagesEnabled: false,
      revenueRealizationRatio: 0,
      restatement: { toCorpCurrency: (v: number) => v, toAnchor: (v: number) => v },
      tariffs: { allTariffs: [], activeFtaPairs: new Set(), activeSubsidies: [] },
      tariffLookups: {
        blendPresenceKeys: new Set(),
        ftaCoverage: {
          byCountryEconomyWide: maps(),
          bySectorType: maps(),
          corpHqByCorpId: maps(),
          pairs: new Set(),
        },
      },
      stateCtx: {
        states: [],
        stateMetricsMap: maps(),
        stateCountryMap: maps(),
        stateNameMap: maps(),
        stateResourceCapacityByState: maps(),
        politicalBaseModifiersByState: maps(),
        macroByCountry: maps(),
        sociByCountry: maps(),
        investorConfidenceByCountry: maps(),
        economicModelByCountry: maps(),
        gameState: null,
      },
      marketCtx: {
        marketShareBySectorId: maps(),
        globalBalances: maps(),
        nationalBalancesByCountry: maps(),
        rawStateBalances: maps(),
        globalPriceRatioByCommodity: maps(),
      },
    } as unknown as Parameters<typeof buildSectorDetails>[0]);
    expect(result.sectorDetails[0].profit).toBe(-924);
    expect(result.totals.totalMaintenanceCosts).toBe(900 - growth);
    expect(result.totals.totalGrowthCosts).toBe(growth);
    expect(
      result.totals.totalRevenue -
        result.totals.totalMaintenanceCosts -
        result.totals.totalGrowthCosts -
        (result.totals.totalFreightCosts ?? 0)
    ).toBe(-924);
  });
});
