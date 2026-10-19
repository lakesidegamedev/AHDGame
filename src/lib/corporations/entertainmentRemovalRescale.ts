/**
 * One-time capacity rescale for the removal of the entertainment commodity
 * (2026-10-19).
 *
 * Every media recipe that sold entertainment now sells the same output value
 * as advertising. A sector's owned units are priced through its strategy's
 * revenue per capacity unit (RPU = 1 / Σ rate / basePrice), and advertising is
 * cheaper per unit than entertainment was, so the same stock would be worth
 * less. Multiplying owned units by RPU_old / RPU_new keeps every sector's
 * nameplate value exactly where it was, the same ratio a strategy switch
 * applies (`capacityRescaleRatio`).
 *
 * The removed mixes are frozen here because the live catalog no longer
 * carries them. Keys are `${operatingType}/${resolvedStrategyId}`.
 */
import { COMMODITY_BASE_PRICES, type CommodityType } from "@/lib/constants/commodities";
import {
  getOperatingSectorType,
  getStrategyForOperatingModel,
} from "@/lib/constants/sectorStrategies";

/** Base price entertainment carried when it was removed. */
export const REMOVED_ENTERTAINMENT_BASE_PRICE = 600;

type FrozenMix = Readonly<Record<string, number>>;

/** Output mixes that included entertainment, as they stood before removal. */
export const REMOVED_ENTERTAINMENT_MIXES: Readonly<Record<string, FrozenMix>> = {
  "media/streaming_media": { advertising: 0.3, entertainment_services: 0.3 },
  // Operating-model strategies: the media baseline value budget (0.5) split by
  // the output strategy's advertising and entertainment shares.
  "media/cable_tv": { advertising: 0.25, entertainment_services: 0.25 },
  "media/publishing_house": { advertising: 0.25, entertainment_services: 0.25 },
  "media/streaming_platform": { advertising: 0.25, entertainment_services: 0.25 },
  "media_entertainment/standard": { advertising: 0.2, entertainment_services: 0.4 },
  "media_entertainment/streaming": {
    advertising: 0.15,
    software: 0.1,
    entertainment_services: 0.35,
  },
  "media_entertainment/live_venue": { advertising: 0.25, entertainment_services: 0.5 },
  "media_entertainment/live_service": { entertainment_services: 0.5 },
  // Entertainment-lane operating models on the lane baseline budget (0.6).
  "media_entertainment/film_studio": { entertainment_services: 0.6 },
  "media_entertainment/music_label": { entertainment_services: 0.6 },
  "media_entertainment/streaming_platform": { advertising: 0.18, entertainment_services: 0.42 },
};

function unitYield(mix: Readonly<Record<string, number>>, entertainmentPrice: number): number {
  let k = 0;
  for (const [commodity, rate] of Object.entries(mix)) {
    if (!(rate > 0)) continue;
    const base =
      commodity === "entertainment_services"
        ? entertainmentPrice
        : COMMODITY_BASE_PRICES[commodity as CommodityType];
    if (base > 0) k += rate / base;
  }
  return k;
}

export interface EntertainmentRescaleSector {
  sectorType: string;
  strategyId?: string | null;
  industryModel?: string | null;
  mediaDiscriminator?: string | null;
}

/**
 * Owned-unit multiplier for one sector: RPU_old / RPU_new = k_new / k_old for
 * its resolved strategy. 1 when the sector's mix never carried entertainment.
 */
export function entertainmentRemovalRescaleRatio(sector: EntertainmentRescaleSector): number {
  const operatingType = getOperatingSectorType(
    sector.sectorType,
    sector.industryModel,
    sector.mediaDiscriminator
  );
  const strategy = getStrategyForOperatingModel(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.industryModel,
    sector.mediaDiscriminator
  );
  if (!strategy) return 1;
  const frozen = REMOVED_ENTERTAINMENT_MIXES[`${operatingType}/${strategy.id}`];
  if (!frozen) return 1;
  const kOld = unitYield(frozen, REMOVED_ENTERTAINMENT_BASE_PRICE);
  const kNew = unitYield(strategy.supply ?? {}, REMOVED_ENTERTAINMENT_BASE_PRICE);
  if (!(kOld > 0) || !(kNew > 0)) return 1;
  const ratio = kNew / kOld;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}
