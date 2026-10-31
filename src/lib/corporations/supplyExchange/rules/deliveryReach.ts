/**
 * Can a supply agreement ever deliver? A contract only moves goods the buyer's
 * plants consume, so a buyer with no plant that uses the commodity, or (for a
 * local service) no such plant in the contract's state, signs a contract that
 * settles zero every turn. Supplier capacity in the named state is checked
 * separately by the capacity validation, and closed trade lanes by the lane
 * guard; this covers the buyer side, which nothing checked before.
 */
import { SECTOR_DEMAND, type CommodityType } from "@/lib/constants/commodities";
import type { MediaDiscriminator, OperatingSectorType } from "@/lib/constants/corporations";
import {
  getEffectiveStrategyRatesForOperatingModel,
  getOperatingSectorType,
} from "@/lib/constants/sectorStrategies";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";

export interface ReachSector {
  sectorType: string;
  stateId?: string | null;
  mothballed?: boolean;
  strategyId?: string | null;
  transitionFromStrategyId?: string | null;
  transitionStartTurn?: number | null;
  industryModel?: string | null;
  mediaDiscriminator?: MediaDiscriminator | null;
}

/** True when an operating sector's recipe consumes the commodity. */
export function sectorUsesCommodity(
  sector: ReachSector,
  commodity: CommodityType,
  turn: number
): boolean {
  if (sector.mothballed === true) return false;
  const rates = getEffectiveStrategyRatesForOperatingModel(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.transitionFromStrategyId,
    sector.transitionStartTurn,
    turn,
    sector.industryModel,
    sector.mediaDiscriminator
  );
  const demand = rates.demand ?? {};
  if (Object.values(demand).some((rate) => (rate ?? 0) > 0)) {
    return (demand[commodity] ?? 0) > 0;
  }
  const operatingType = getOperatingSectorType(
    sector.sectorType,
    sector.industryModel,
    sector.mediaDiscriminator
  );
  return (SECTOR_DEMAND[operatingType as OperatingSectorType] ?? []).some(
    (entry) => entry.commodity === commodity && entry.rate > 0
  );
}

export interface BuyerCommodityUse {
  /** Any active plant of the buyer consumes the commodity. */
  usesAnywhere: boolean;
  /** States holding an active plant that consumes it, sorted. */
  states: string[];
}

export function buyerCommodityUse(
  sectors: readonly ReachSector[],
  commodity: CommodityType,
  turn: number
): BuyerCommodityUse {
  const states = new Set<string>();
  let usesAnywhere = false;
  for (const sector of sectors) {
    if (!sectorUsesCommodity(sector, commodity, turn)) continue;
    usesAnywhere = true;
    if (sector.stateId) states.add(sector.stateId);
  }
  return { usesAnywhere, states: [...states].sort() };
}

export type SupplyReachProblem =
  { code: "buyerDoesNotUse" } | { code: "buyerNotInState"; stateId: string; buyerStates: string[] };

/**
 * Null when the buyer can take delivery, otherwise why it never can. A local
 * service (see commodityMarketScope) only reaches plants in its own state.
 */
export function supplyAgreementReachProblem(args: {
  commodity: CommodityType;
  stateId?: string | null;
  buyerUse: BuyerCommodityUse;
}): SupplyReachProblem | null {
  if (!args.buyerUse.usesAnywhere) return { code: "buyerDoesNotUse" };
  if (isStateScopedCommodity(args.commodity)) {
    const stateId = args.stateId ?? "";
    if (!args.buyerUse.states.includes(stateId)) {
      return { code: "buyerNotInState", stateId, buyerStates: args.buyerUse.states };
    }
  }
  return null;
}

/** Player-facing sentence for a reach problem, addressed by who is reading. */
export function supplyReachMessage(
  problem: SupplyReachProblem,
  args: { commodityLabel: string; readerIsBuyer: boolean }
): string {
  const who = args.readerIsBuyer ? "Your corporation has" : "The buyer has";
  if (problem.code === "buyerDoesNotUse") {
    return `${who} no active plant that uses ${args.commodityLabel}, so this contract could never deliver.`;
  }
  const where =
    problem.buyerStates.length > 0
      ? ` ${args.readerIsBuyer ? "Your" : "Its"} plants that use it are in ${problem.buyerStates.join(", ")}.`
      : "";
  return `${args.commodityLabel} only reaches plants in the same state. ${who} no active plant in ${problem.stateId || "that state"} that uses it, so this contract could never deliver.${where}`;
}
