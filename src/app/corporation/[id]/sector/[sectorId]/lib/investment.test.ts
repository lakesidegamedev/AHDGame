import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { buildSectorPlantsSection } from "@/lib/corporations/queries/sectorDetailSections";
import type { CorporateSector } from "@/lib/db/types";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import type { PlantsData } from "../types";
import { buildReturnSummary, forecastBlocker } from "./investment";

/** One young funded plant: a booked P&L with no cost breakdown, no clearing stamp. */
function youngFundedSector(patch: Partial<CorporateSector> = {}): CorporateSector {
  return {
    _id: new ObjectId(),
    corporationId: new ObjectId(),
    countryId: "US",
    stateId: "CT",
    sectorType: "manufacturing",
    targetGrowthRate: 0,
    currentGrowthRate: 0,
    currentGrowthCost: 0,
    revenue: 85861.4,
    profitMargin: 50,
    effectiveProfitMargin: 50,
    workers: 10,
    capitalStock: 1.3258,
    operatingCapacityUnits: 1.3258,
    producedUnits: 1.3902,
    soldUnits: 1.4452,
    plantsStartTurn: 150,
    producerSettlement: {
      turn: 166,
      capacityUnits: 1.3258,
      activeUnits: 1.3258,
      producedUnits: 1.3902,
      soldUnits: 1.4452,
      revenue: 3979.9,
    },
    plantsPnl: {
      turn: 166,
      source: "funded",
      revenue: 85861.4,
      profit: 43148.1,
      totalCost: 42713.3,
      compliance: 0,
      stockAddedAtCost: 0,
      transitionSupport: 0,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  } as unknown as CorporateSector;
}

function plantsFor(sector: CorporateSector): PlantsData {
  const section = buildSectorPlantsSection({
    sector,
    sectorType: "manufacturing",
    currentTurn: 166,
    currentYear: 2029,
    governorCap: 0.15,
    governorRampTurns: 48,
    worldGovernorAnchorTurn: 1,
    marketSharePercent: 10,
    competitorCount: 1,
    primeRate: 4,
    ceoAcumen: NEUTRAL_STAT,
    hostCostOfLivingIndex: 100,
    techGrowthCostMultiplier: 1,
    corpCapitalAnchor: 10_000_000,
    workers: 10,
    eraUnitScale: 1,
    demandGapUnits: 50,
    money: {
      realizedRevenueAnchor: 3979.9,
      nameplateRevenueAnchor: 3979.9,
      maintenanceNetAnchor: 1800,
      labourAnchor: 300,
      growthCostAnchor: 0,
      profitAnchor: 1900,
      inputsAnchor: 1500,
    },
    regulatoryBurdenPp: 0,
    crisisMarginPenaltyPp: 0,
    depositBound: false,
    fxSpreadRate: 0,
    investment: { overheadDailyAnchor: 100, taxRatePercent: 25 },
  });
  return {
    ...section,
    pnl: {
      revenueAnchor: 3979.9,
      inputsAnchor: 1500,
      labourAnchor: 300,
      upkeepAnchor: 0,
      complianceAnchor: 0,
      otherOperatingAnchor: 0,
      growthAndBuildAnchor: 0,
    },
    buildQuote: { ...section.buildQuote, perUnitAnchor: 1000, perUnitChargedAnchor: 1000 },
  } as unknown as PlantsData;
}

describe("build return summary for a small funded sector", () => {
  it("gives profit and payback once the market support ramp has ended", () => {
    const plants = plantsFor(youngFundedSector());
    expect(plants.investment).toBeDefined();
    const summary = buildReturnSummary(plants, 2);
    expect(summary).not.toBeNull();
    expect(Number.isFinite(summary!.profitPerTurn)).toBe(true);
  });

  it("names the missing input instead of calling the results incomplete", () => {
    const plants = plantsFor(
      youngFundedSector({
        effectiveProfitMargin: undefined,
        plantsUpkeepMarginBasisAnchor: undefined,
      })
    );
    expect(buildReturnSummary(plants, 2)).toBeNull();
    expect(forecastBlocker(plants)).toBe("upkeepBasis");
  });

  it("calls a strategy change a transition", () => {
    const plants = plantsFor(youngFundedSector({ transitionFromStrategyId: "other" }));
    expect(forecastBlocker(plants)).toBe("transition");
  });
});
