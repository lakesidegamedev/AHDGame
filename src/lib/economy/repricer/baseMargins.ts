/**
 * Base-price margin bench (market recovery plan, phases 0 and 1).
 *
 * For every operating sector type and strategy, builds the plant P&L of a
 * fully running plant from the same cost functions the turn bills with
 * (`computeInputsCost`, `computeSectorLaborCost`, `computePlantOverhead`,
 * `assemblePhysicalPnl`), at base prices unless a scenario overrides them.
 * Pure: no database, no clock. Upkeep is zero because the turn bills upkeep
 * on idle capacity only.
 *
 * Phase 1 uses this to find every standard strategy that cannot earn its
 * designed margin at ordinary prices, and its test fails if one leaves the
 * band once the recalibration lands.
 */
import { OPERATING_SECTOR_TYPES, type OperatingSectorType } from "@/lib/constants/corporations";
import { getSectorStrategies } from "@/lib/constants/sectorStrategies";
import { revenuePerCapacityUnitForStrategy } from "@/lib/constants/capacityEconomy";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_TYPES,
  type CommodityType,
} from "@/lib/constants/commodities";
import { computeSectorLaborCost } from "@/lib/labour/laborCost";
import { computeInputsCost, assemblePhysicalPnl } from "@/lib/corporations/physicalPnl";
import { computePlantOverhead } from "@/lib/corporations/plantCosts/rules";
import { computePriceRealization } from "@/lib/market/priceRealization";
import { plantLaborShare } from "@/lib/corporations/plantCosts/rules";
import { SECTOR_TYPE_MATCH_BONUS } from "@/lib/corporations/specialization/rules";
import { stagedLaborShare } from "@/lib/market/marketRecoveryStages";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";

export interface BaseMarginScenario {
  /** Lagged price / base per commodity. Missing = 1 (base price). */
  priceRatios?: Partial<Record<CommodityType, number>>;
  /** Override the labour share per sector type (before the recovery stage). */
  laborShare?: Partial<Record<string, number>>;
  /** Market recovery stage applied to labour shares (stage 1 relief). */
  marketRecoveryStage?: number;
  /** Scale every recipe input rate of a sector type, e.g. { healthcare: 0.85 }. */
  inputRateScale?: Partial<Record<string, number>>;
  /** Replace a strategy's recipe outright, keyed "sectorType/strategyId". */
  recipes?: Partial<Record<string, Partial<Record<CommodityType, number>>>>;
  year?: number;
  preset?: string;
}

export interface BaseMarginRow {
  sectorType: OperatingSectorType;
  strategyId: string;
  inputsPct: number;
  labourPct: number;
  overheadPct: number;
  /** Margin with no policy stack at all. */
  bareMarginPct: number;
  /** Margin for a plant of its owner's own type (+ type match bonus). */
  ownTypeMarginPct: number;
  /** Margin for an off-type plant (type mismatch penalty). */
  offTypeMarginPct: number;
}

const OFF_TYPE_PP = -15;

export function baseMarginRow(
  sectorType: OperatingSectorType,
  strategyId: string,
  scenario: BaseMarginScenario = {}
): BaseMarginRow | null {
  const year = scenario.year ?? 1991;
  const preset = scenario.preset ?? "1991-default";
  const strategy = getSectorStrategies(sectorType, false, null, preset).find(
    (s) => s.id === strategyId
  );
  if (!strategy) return null;
  const dailyRevenue = revenuePerCapacityUnitForStrategy(sectorType, strategy.id, 1);
  if (!(dailyRevenue > 0)) return null;
  const priceRatios = new Map(
    COMMODITY_TYPES.map((c) => [c, scenario.priceRatios?.[c] ?? 1] as [CommodityType, number])
  );
  // The turn's own curve: per commodity, weighted by supply rate.
  const hourlyRevenue =
    (dailyRevenue / TURNS_PER_DAY) * computePriceRealization(strategy.supply ?? {}, priceRatios);
  const scale = scenario.inputRateScale?.[sectorType] ?? 1;
  const recipe = scenario.recipes?.[`${sectorType}/${strategy.id}`] ?? strategy.demand ?? {};
  const rates = Object.fromEntries(
    Object.entries(recipe).map(([c, r]) => [c, (r as number) * scale])
  );
  const inputs = computeInputsCost({
    nominalDailyRevenue: dailyRevenue,
    rates,
    basePrices: COMMODITY_BASE_PRICES,
    priceRatios,
    utilization: 1,
    inputMultiplier: 1,
    turnsPerDay: TURNS_PER_DAY,
    mothballed: false,
  });
  // Explicit plants price payroll for their production method (hardware differs).
  const share0 =
    scenario.laborShare?.[sectorType] ??
    plantLaborShare({ sectorType, strategyId: strategy.id, currentTurn: 0, year });
  const share = stagedLaborShare(sectorType, share0, scenario.marketRecoveryStage ?? 0);
  // No maintenance clamp: the bench reports the share the turn would bill.
  const labour = computeSectorLaborCost({
    hourlyRevenue,
    grossMaintenance: Number.MAX_SAFE_INTEGER,
    laborShare0: share,
    wageMultiplier: 1,
  });
  const overhead = computePlantOverhead({
    nominalDailyRevenue: dailyRevenue,
    capacity: 1,
    producedUnits: 1,
    turnsPerDay: TURNS_PER_DAY,
    mothballed: false,
  });
  const margin = (policyPp: number) =>
    (100 *
      assemblePhysicalPnl({
        hourlyRevenue,
        inputsCost: inputs.total,
        laborCost: labour.laborCost,
        otherOpex: overhead,
        upkeep: 0,
        complianceCost: 0,
        financialLegs: 0,
        growthCost: 0,
        policyCredit: (hourlyRevenue * policyPp) / 100,
      }).profit) /
    hourlyRevenue;
  const pct = (x: number) => (100 * x) / hourlyRevenue;
  return {
    sectorType,
    strategyId: strategy.id,
    inputsPct: pct(inputs.total),
    labourPct: pct(labour.laborCost),
    overheadPct: pct(overhead),
    bareMarginPct: margin(0),
    ownTypeMarginPct: margin(SECTOR_TYPE_MATCH_BONUS),
    offTypeMarginPct: margin(OFF_TYPE_PP),
  };
}

export function baseMarginTable(scenario: BaseMarginScenario = {}): BaseMarginRow[] {
  const rows: BaseMarginRow[] = [];
  for (const type of OPERATING_SECTOR_TYPES) {
    for (const s of getSectorStrategies(type, false, null, scenario.preset ?? "1991-default")) {
      const row = baseMarginRow(type, s.id, scenario);
      if (row) rows.push(row);
    }
  }
  return rows;
}
