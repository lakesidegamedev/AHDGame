import type { CorporateSector } from "@/lib/db/types/corporation";
import { getOperatingSectorType, getStrategy } from "@/lib/constants/sectorStrategies";

type StrategyFields = Pick<
  CorporateSector,
  "sectorType" | "industryModel" | "mediaDiscriminator" | "strategyId"
>;

function strategyLabel(sector: StrategyFields, strategyId: string): string {
  const operatingType = getOperatingSectorType(
    sector.sectorType,
    sector.industryModel,
    sector.mediaDiscriminator
  );
  return getStrategy(operatingType, strategyId).name || strategyId;
}

/**
 * Why a bought site cannot fold into the buyer's existing site in the same
 * market, or null when it can. A merge keeps the survivor's strategy, so a
 * bought site on a different one would silently change what its capacity
 * produces. The market lane (sector type, industry model, media lane) already
 * matches by construction; the strategy is the remaining production setting.
 */
export function sectorMergeStrategyRefusal(
  sold: StrategyFields,
  existing: StrategyFields
): string | null {
  const soldId = sold.strategyId ?? "standard";
  const existingId = existing.strategyId ?? "standard";
  if (soldId === existingId) return null;
  return (
    `The site for sale runs the "${strategyLabel(sold, soldId)}" strategy, but your site in ` +
    `that market runs "${strategyLabel(existing, existingId)}". Switch your existing site to ` +
    `"${strategyLabel(sold, soldId)}" first, then buy this one.`
  );
}
