/**
 * Industry conversion at book value (funded-market transition package, owner
 * decision 2026-10-20: free conversion, same or another industry).
 *
 * A sector moves to another operating lane keeping its paid capacity value.
 * Capacity is denominated in units of daily output whose build price scales
 * with revenue per unit, so the same RPU ratio retooling uses keeps both the
 * nameplate (units x RPU) and the paid basis meaningful across lanes:
 *
 *   units_to = units_from x RPU_from / RPU_to
 *
 * In-flight orders rescale by the same ratio (cash paid is untouched) and the
 * per-unit operating anchor moves inversely, so operating cost in money stays
 * put. Stock of goods the new plant does not make stays on the books and is
 * sold off as retained output.
 *
 * Pure: identities and capacity in, a `$set` fragment out.
 */
import {
  operatingSectorIdentity,
  type MediaDiscriminator,
  type OperatingSectorType,
} from "@/lib/constants/corporations";
import {
  rescaleBuildQueueForStrategyChange,
  revenuePerCapacityUnitForStrategy,
} from "@/lib/constants/capacityEconomy";
import { getOperatingSectorType, SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategies";
import { rescaleOtherOpexAnchorForRetool } from "@/lib/corporations/physicalPnl";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import type { CorporateSector, SectorBuildOrder } from "@/lib/db/types";

export interface ConversionSource {
  sectorType: CorporateSector["sectorType"];
  industryModel?: string | null;
  mediaDiscriminator?: MediaDiscriminator | null;
  strategyId?: string | null;
  capitalStock?: number | null;
  buildQueue?: SectorBuildOrder[] | null;
  otherOpexPerUnitAnchor?: number | null;
}

export type ConversionResult =
  { ok: false; reason: string } | { ok: true; ratio: number; set: Record<string, unknown> };

/** The target lane's strategy: the one asked for if valid, else standard, else its first. */
export function conversionStrategyId(lane: OperatingSectorType, requested?: string | null) {
  const strategies = SECTOR_STRATEGIES[lane] ?? [];
  if (requested && strategies.some((s) => s.id === requested)) return requested;
  return strategies.find((s) => s.id === "standard")?.id ?? strategies[0]?.id ?? null;
}

export function industryConversionFields(
  from: ConversionSource,
  toLane: OperatingSectorType,
  requestedStrategyId?: string | null
): ConversionResult {
  const fromLane = getOperatingSectorType(
    from.sectorType,
    from.industryModel,
    from.mediaDiscriminator
  );
  if (fromLane === toLane)
    return { ok: false, reason: "Choose a different industry, or retool within this one." };
  const toStrategyId = conversionStrategyId(toLane, requestedStrategyId);
  if (!toStrategyId) return { ok: false, reason: "That industry has no production method." };
  const to = operatingSectorIdentity(toLane);
  const rpuFrom = revenuePerCapacityUnitForStrategy(
    from.sectorType,
    from.strategyId,
    1,
    from.industryModel,
    from.mediaDiscriminator
  );
  const rpuTo = revenuePerCapacityUnitForStrategy(
    to.sectorType,
    toStrategyId,
    1,
    to.industryModel,
    to.mediaDiscriminator
  );
  const ratio = rpuFrom / rpuTo;
  if (!(rpuFrom > 0) || !(rpuTo > 0) || !Number.isFinite(ratio) || !(ratio > 0))
    return { ok: false, reason: "This sector's capacity cannot be valued for conversion." };

  const stock =
    typeof from.capitalStock === "number" && Number.isFinite(from.capitalStock)
      ? Math.max(0, from.capitalStock) * ratio
      : 0;
  const set: Record<string, unknown> = {
    sectorType: to.sectorType,
    industryModel: to.industryModel,
    mediaDiscriminator: to.mediaDiscriminator,
    strategyId: toStrategyId,
    capitalStock: stock,
    ...seedPlantLedger(to.sectorType, stock, to.industryModel, to.mediaDiscriminator),
    buildQueue: rescaleBuildQueueForStrategyChange(from.buildQueue ?? [], ratio),
    // Old products' asking policies do not apply to the new outputs.
    producerQuotes: {},
  };
  const opex = rescaleOtherOpexAnchorForRetool(from.otherOpexPerUnitAnchor, ratio);
  if (opex != null) set.otherOpexPerUnitAnchor = opex;
  return { ok: true, ratio, set };
}
