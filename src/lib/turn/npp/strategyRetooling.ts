import type { ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CorporationType, OperatingSectorType } from "@/lib/constants/corporations";
import { SECTOR_STRATEGIES, STRATEGY_COOLDOWN_TURNS } from "@/lib/constants/sectorStrategies";
import { getStrategyAvailability } from "@/lib/constants/techTree/strategyAvailability";
import type { TechDiffusionSnapshot } from "@/lib/constants/techTree/diffusion";
import { retoolRescaleFields } from "@/lib/corporations/retoolRescale";
import type { CommodityPriceRatioFn } from "@/lib/turn/npp/marketSignals";
import { sunsetRepairTarget } from "./rules/obsoleteStrategyRepair";
import { strategyPriceScore } from "./rules/foundingRecipe";
import { isParentDirectedStrategyProtected } from "./rules/parentDirectedStrategy";

/** Effective profit margin at or below which a sector is a shift candidate. */
export const STRATEGY_SHIFT_MARGIN_TRIGGER = -3;
/** Required price-score advantage over the current strategy. */
export const STRATEGY_SHIFT_MIN_ADVANTAGE = 0.08;
/** High bar for a profitable sector to retool toward a shortage. */
export const STRATEGY_SHIFT_PROFIT_SEEK_ADVANTAGE = 0.25;

// The retool price score is shared with founding (rules/foundingRecipe).
export { strategyPriceScore };

export interface StrategyRetoolDecision {
  sectorId: ObjectId;
  updates: Record<string, unknown>;
}

interface StrategyRetoolContext {
  corp: Corporation;
  sectors: readonly CorporateSector[];
  divestedSectorIds: readonly ObjectId[];
  turn: number;
  now: Date;
  currentYear: number;
  techTreesEnabled: boolean;
  /**
   * World frontier research per lane, read once per turn. Absent keeps every
   * breakthrough method closed.
   */
  sectorResearchByLane?: ReadonlyMap<string, number>;
  /**
   * Readiness by country and method operators in worlds with technology
   * diffusion. NPPs adopt at their country's lag; absent keeps the calendar.
   */
  techDiffusion?: TechDiffusionSnapshot;
  plantsEnabled: boolean;
  priceRatioOf: CommodityPriceRatioFn;
}

/**
 * Selects at most one running sector whose reachable recipe has a material
 * price advantage, then returns the complete transition write for that sector.
 */
export function chooseNppStrategyRetool(ctx: StrategyRetoolContext): StrategyRetoolDecision | null {
  let best: {
    sector: CorporateSector;
    toStrategyId: string;
    advantage: number;
    corrective?: true;
  } | null = null;

  for (const sector of ctx.sectors) {
    if (sector.mothballed === true) continue;
    if (ctx.divestedSectorIds.includes(sector._id)) continue;
    if (sector.sectorType === "extraction") continue;
    if (
      typeof sector.transitionCooldownUntilTurn === "number" &&
      sector.transitionCooldownUntilTurn > ctx.turn
    ) {
      continue;
    }
    if (sector.transitionFromStrategyId) continue;
    // A controlling parent's CEO chose this strategy; the AI leaves it alone.
    if (isParentDirectedStrategyProtected(sector, ctx.turn)) continue;

    const operatingType = sector.sectorType;
    const strategies = SECTOR_STRATEGIES[operatingType as OperatingSectorType];
    if (!strategies || strategies.length < 2) continue;
    const countryId = sector.countryId ?? ctx.corp.countryId;
    const world = {
      sectorResearch: ctx.sectorResearchByLane?.get(operatingType),
      laneResearch: ctx.sectorResearchByLane,
      diffusion: ctx.techDiffusion
        ? { snapshot: ctx.techDiffusion, countryId, adopter: "npp" as const }
        : undefined,
    };
    const currentId = sector.strategyId ?? "standard";
    const current = strategies.find((strategy) => strategy.id === currentId);
    if (!current) continue;
    // A retired method converts to its best open successor, ahead of any
    // price-seeking retool.
    if (ctx.techTreesEnabled) {
      const successor = sunsetRepairTarget(
        current,
        strategies,
        ctx.currentYear,
        (candidate) =>
          !getStrategyAvailability(
            ctx.corp,
            candidate,
            ctx.currentYear,
            ctx.techTreesEnabled,
            world
          ).locked,
        (candidate) => strategyPriceScore(candidate, countryId, ctx.priceRatioOf)
      );
      if (successor) {
        if (!best?.corrective) {
          best = { sector, toStrategyId: successor.id, advantage: 0, corrective: true };
        }
        continue;
      }
    }
    if (best?.corrective) continue;
    const currentScore = strategyPriceScore(current, countryId, ctx.priceRatioOf);
    if (currentScore == null) continue;

    const distressed = (sector.effectiveProfitMargin ?? 0) <= STRATEGY_SHIFT_MARGIN_TRIGGER;
    for (const candidate of strategies) {
      if (candidate.id === currentId) continue;
      const availability = getStrategyAvailability(
        ctx.corp,
        candidate,
        ctx.currentYear,
        ctx.techTreesEnabled,
        world
      );
      if (availability.locked) continue;
      const score = strategyPriceScore(candidate, countryId, ctx.priceRatioOf);
      if (score == null) continue;
      const advantage = score - currentScore;
      const requiredAdvantage = distressed
        ? STRATEGY_SHIFT_MIN_ADVANTAGE
        : STRATEGY_SHIFT_PROFIT_SEEK_ADVANTAGE;
      if (advantage < requiredAdvantage) continue;
      if (best == null || advantage > best.advantage) {
        best = { sector, toStrategyId: candidate.id, advantage };
      }
    }
  }

  if (!best) return null;
  const fromStrategyId = best.sector.strategyId ?? "standard";
  return {
    sectorId: best.sector._id,
    updates: {
      strategyId: best.toStrategyId,
      transitionFromStrategyId: fromStrategyId,
      transitionStartTurn: ctx.turn,
      transitionCooldownUntilTurn: ctx.turn + STRATEGY_COOLDOWN_TURNS,
      ...retoolRescaleFields({
        sectorType: best.sector.sectorType as CorporationType,
        fromStrategyId,
        toStrategyId: best.toStrategyId,
        plantsEnabled: ctx.plantsEnabled,
        capitalStock: best.sector.capitalStock,
        buildQueue: best.sector.buildQueue,
        otherOpexPerUnitAnchor: best.sector.otherOpexPerUnitAnchor,
      }),
      updatedAt: ctx.now,
    },
  };
}
