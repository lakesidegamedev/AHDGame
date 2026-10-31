/**
 * Shell for the commodity-level build toll: loads a firm's sectors (with their
 * queues) and world demand (plus the target state's demand for commodities
 * that only sell where they are made), then hands them to the pure rules in
 * `rules/commodityDominance.ts`. Used by the build command, the build quote and
 * anything else that must price a build the way the server charges it.
 */
import type { Db } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_LABELS,
  type CommodityType,
} from "@/lib/constants/commodities";
import { getEffectiveStrategyRatesForOperatingModel } from "@/lib/constants/sectorStrategies";
import { undeliveredUnits } from "@/lib/corporations/buildDelivery";
import type { CommodityTollModel } from "@/lib/corporations/rules/commodityDominanceRamp";
import {
  commodityDominanceMarket,
  commodityDominanceRatio,
  sectorInDominanceMarket,
  type CommodityDominanceResult,
  type CommodityDominanceSector,
} from "@/lib/corporations/rules/commodityDominance";
import { computeSupplierCommodityCapacityUnits } from "@/lib/corporations/supplyAgreementCapacity";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import {
  controlGroupMemberIds,
  controlGroupRootByCorpId,
} from "@/lib/corporations/groups/controlGroups";

/** gameConfig.groupSizeCostsStage at which the commodity toll reads the whole control group. */
export const GROUP_DOMINANCE_TOLL_STAGE = 2;

export const FIRM_SECTOR_PROJECTION = {
  sectorType: 1,
  industryModel: 1,
  mediaDiscriminator: 1,
  capitalStock: 1,
  strategyId: 1,
  transitionFromStrategyId: 1,
  transitionStartTurn: 1,
  retoolRescaleApplied: 1,
  activeCapacityPercent: 1,
  productionPolicyLevel: 1,
  countryId: 1,
  stateId: 1,
  buildQueue: 1,
} as const;

/**
 * Ids of the corporations whose capacity counts toward `corporationId`'s
 * toll: its whole control group once the group stage is on, else just itself.
 */
async function dominanceCorporationIds(
  db: Db,
  corporationId: Corporation["_id"],
  groupSizeCostsStage: number
): Promise<Corporation["_id"][]> {
  if (groupSizeCostsStage < GROUP_DOMINANCE_TOLL_STAGE) return [corporationId];
  const corps = await db
    .collection<Corporation>("corporations")
    .find({}, { projection: { shareholders: 1, totalShares: 1, superShareMultiplier: 1 } })
    .toArray();
  const roots = controlGroupRootByCorpId(corps);
  const memberIds = new Set(controlGroupMemberIds(roots, corporationId.toString()));
  const members = corps.filter((c) => memberIds.has(c._id.toString())).map((c) => c._id);
  return members.length > 0 ? members : [corporationId];
}

/** Everything needed to price the commodity toll for one sector, any order size. */
export interface CommodityDominanceContext {
  sectors: CommodityDominanceSector[];
  /** Commodities the target sector makes. */
  commodities: CommodityType[];
  /** World demand per commodity (units/day), absent when unknown. */
  demand: Partial<Record<CommodityType, number>>;
  /** Target state's demand per state-scoped commodity, absent when unknown. */
  stateDemand?: Partial<Record<CommodityType, number>>;
  targetSectorId: string;
  /** State the target sector sits in, for state-scoped commodities. */
  targetStateId?: string | null;
  isNatcorp: boolean;
  turn: number;
  currentYear: number;
  commandEconomyEnabled: boolean;
}

export type FirmSectorRow = Pick<
  CorporateSector,
  | "_id"
  | "sectorType"
  | "industryModel"
  | "mediaDiscriminator"
  | "capitalStock"
  | "strategyId"
  | "transitionFromStrategyId"
  | "transitionStartTurn"
  | "retoolRescaleApplied"
  | "activeCapacityPercent"
  | "productionPolicyLevel"
  | "countryId"
  | "stateId"
  | "buildQueue"
>;

/**
 * Potential output ignores temporary states: a mothballed or embargoed plant
 * can be restarted, so it still counts toward what the firm could put on the
 * market. Queued units count in full (the whole point of looking at orders).
 */
export function toDominanceSector(row: FirmSectorRow, turn: number): CommodityDominanceSector {
  const queued = (row.buildQueue ?? []).reduce((sum, o) => sum + undeliveredUnits(o, turn), 0);
  return {
    _id: row._id,
    sectorType: row.sectorType,
    industryModel: row.industryModel,
    mediaDiscriminator: row.mediaDiscriminator,
    capitalStock: row.capitalStock ?? 0,
    strategyId: row.strategyId,
    transitionFromStrategyId: row.transitionFromStrategyId,
    transitionStartTurn: row.transitionStartTurn,
    retoolRescaleApplied: row.retoolRescaleApplied,
    activeCapacityPercent: row.activeCapacityPercent,
    productionPolicyLevel: row.productionPolicyLevel,
    countryId: row.countryId,
    stateId: row.stateId,
    queuedUnits: queued,
  };
}

/** Commodities a sector's output mix contains. */
export function sectorOutputCommodities(
  sector: Pick<
    CommodityDominanceSector,
    | "sectorType"
    | "industryModel"
    | "mediaDiscriminator"
    | "strategyId"
    | "transitionFromStrategyId"
    | "transitionStartTurn"
  >,
  turn: number
): CommodityType[] {
  const rates = getEffectiveStrategyRatesForOperatingModel(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.transitionFromStrategyId,
    sector.transitionStartTurn,
    turn,
    sector.industryModel,
    sector.mediaDiscriminator
  );
  const mix = rates.supply ?? {};
  return (Object.keys(mix) as CommodityType[]).filter(
    (c) => (mix[c] ?? 0) > 0 && COMMODITY_BASE_PRICES[c] > 0
  );
}

/**
 * Load the commodity-toll context for one sector. Returns null when the sector
 * makes nothing measurable or the read fails: a hiccup must not turn into a
 * phantom toll, and the local dominance toll still applies either way.
 */
export async function loadCommodityDominanceContext(
  db: Db,
  args: {
    corporation: Pick<Corporation, "_id" | "countryOwnerId">;
    sector: Pick<CorporateSector, "_id">;
    turn: number;
    currentYear: number;
  }
): Promise<CommodityDominanceContext | null> {
  try {
    const config = await db
      .collection<{ commandEconomyEnabled?: boolean; groupSizeCostsStage?: number }>("gameConfig")
      .findOne(
        { _id: "default" as never },
        { projection: { commandEconomyEnabled: 1, groupSizeCostsStage: 1 } }
      );
    const corporationIds = await dominanceCorporationIds(
      db,
      args.corporation._id,
      typeof config?.groupSizeCostsStage === "number" ? config.groupSizeCostsStage : 0
    );
    const rows = await db
      .collection<CorporateSector>("corporateSectors")
      .find({ corporationId: { $in: corporationIds } }, { projection: FIRM_SECTOR_PROJECTION })
      .toArray();
    const commandEconomyEnabled = config?.commandEconomyEnabled === true;
    const sectors = (rows as FirmSectorRow[]).map((r) => toDominanceSector(r, args.turn));
    const targetIndex = sectors.findIndex((s) => String(s._id) === String(args.sector._id));
    if (targetIndex < 0) return null;
    // Price the toll on the strategy the ORDER will run, not the trailing
    // retool blend. A sector part-way through standard -> iron_mining still
    // reports the old diversified mix to production, so counting that mix
    // charged an iron mine for its timber/rare-earth byproducts: a firm with
    // 26k units of queued extraction capacity was quoted 40x because 1.5% of
    // its transitional mix was timber against a 36 unit/day world market.
    // The new units land after the retool and will make iron only. Other
    // sectors of the firm keep their live effective mix, because they are not
    // being expanded and their current output is real.
    const pricedSectors = sectors.map((sector, index) =>
      index === targetIndex
        ? { ...sector, transitionFromStrategyId: null, transitionStartTurn: null }
        : sector
    );
    const pricedTarget = pricedSectors[targetIndex];
    const commodities = sectorOutputCommodities(pricedTarget, args.turn);
    if (commodities.length === 0) return null;
    const targetStateId = pricedTarget.stateId ? String(pricedTarget.stateId) : null;
    const readsState = targetStateId != null && commodities.some(isStateScopedCommodity);
    const priceDocs = await db
      .collection<CommodityPrice>("commodityPrices")
      .find(
        { commodity: { $in: commodities } },
        {
          projection: {
            commodity: 1,
            globalDemand: 1,
            ...(readsState ? { [`stateDemand.${targetStateId}`]: 1 } : {}),
          },
        }
      )
      .toArray();
    const demand: Partial<Record<CommodityType, number>> = {};
    const stateDemand: Partial<Record<CommodityType, number>> = {};
    for (const doc of priceDocs) {
      demand[doc.commodity] = doc.globalDemand;
      const local = targetStateId ? doc.stateDemand?.[targetStateId] : undefined;
      if (typeof local === "number") stateDemand[doc.commodity] = local;
    }
    return {
      sectors: pricedSectors,
      commodities,
      demand,
      stateDemand,
      targetSectorId: String(args.sector._id),
      targetStateId,
      isNatcorp: !!args.corporation.countryOwnerId,
      turn: args.turn,
      currentYear: args.currentYear,
      commandEconomyEnabled,
    };
  } catch (err) {
    console.error("[commodityDominance] context load failed", err);
    return null;
  }
}

/** Potential/demand ratio for the target sector after an order of `extraUnits`. */
export function commodityDominanceFor(
  ctx: CommodityDominanceContext,
  extraUnits: number
): CommodityDominanceResult {
  return commodityDominanceRatio({
    sectors: ctx.sectors,
    commodities: ctx.commodities,
    demandOf: (c) => ctx.demand[c],
    stateDemandOf: (c) => ctx.stateDemand?.[c],
    targetSectorId: ctx.targetSectorId,
    targetStateId: ctx.targetStateId,
    extraUnits,
    isNatcorp: ctx.isNatcorp,
    turn: ctx.turn,
    currentYear: ctx.currentYear,
    commandEconomyEnabled: ctx.commandEconomyEnabled,
  });
}

/**
 * Linearisation of the toll for a client that re-prices quantities locally: per
 * commodity, the firm's current potential and how many commodity units one new
 * capacity unit adds. Empty when nothing is measurable.
 */
export function commodityTollModels(ctx: CommodityDominanceContext): CommodityTollModel[] {
  const probe = 1e6;
  const models: CommodityTollModel[] = [];
  for (const commodity of ctx.commodities) {
    const market = commodityDominanceMarket({
      commodity,
      targetStateId: ctx.targetStateId,
      worldDemand: ctx.demand[commodity],
      stateDemand: ctx.stateDemand?.[commodity],
    });
    if (!market) continue;
    const demandUnits = market.demand;
    const marketSectors = ctx.sectors.filter((s) => sectorInDominanceMarket(s, market));
    const potentialAt = (extra: number): number =>
      computeSupplierCommodityCapacityUnits({
        sectors: marketSectors.map((s) => ({
          ...s,
          capitalStock:
            (s.capitalStock ?? 0) +
            (Number.isFinite(s.queuedUnits) ? Math.max(0, s.queuedUnits as number) : 0) +
            (String(s._id) === ctx.targetSectorId ? extra : 0),
        })),
        commodity,
        isNatcorp: ctx.isNatcorp,
        turn: ctx.turn,
        currentYear: ctx.currentYear,
        commandEconomyEnabled: ctx.commandEconomyEnabled,
      });
    const potentialUnits = potentialAt(0);
    const yieldPerUnit = (potentialAt(probe) - potentialUnits) / probe;
    models.push({
      commodity,
      label: COMMODITY_LABELS[commodity] ?? commodity,
      demandUnits,
      potentialUnits,
      yieldPerUnit,
    });
  }
  return models;
}
