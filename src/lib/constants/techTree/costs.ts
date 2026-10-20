/**
 * Where tech unlock prices come from. Unlocking a node costs its rdScore price
 * plus cash. The cash price is set by what the node is worth to THIS
 * corporation: its estimated per-turn saving or extra profit on the corp's own
 * plants, times TECH_NODE_PAYBACK_TURNS (one game year). Every corp therefore
 * waits about the same number of turns for a tech to pay for itself, whatever
 * its size. Nodes with no running plant value (build discounts, shields,
 * strength grants, production methods) cost a small fraction of daily gross
 * revenue instead. A minimum cash price (TECH_NODE_CASH_FLOOR_ANCHOR, scaled
 * to the world era) stops tiny and zero-revenue corps from unlocking nodes for
 * R&D points alone (ticket #1506). Cash is charged in the corp's currency.
 */
import type { TechTreeNode } from "./nodes";
import type { TechEffect } from "./effects";
import { CORP_LANE_EFFECT_SCALE } from "./effects";
import { TURNS_PER_YEAR } from "../turnTime";

/**
 * Cash price of a node with no running plant value, as a fraction of daily
 * gross revenue, unless the node overrides it. A third of the old flat 15%,
 * which priced every node at roughly a day of a corp's profit regardless of
 * what it bought.
 */
export const TECH_NODE_CASH_REVENUE_FRACTION = 0.05;

/** Turns a tech's cash price is meant to take to pay back: one game year. */
export const TECH_NODE_PAYBACK_TURNS = TURNS_PER_YEAR;

/**
 * Share of a sector's input bill one commodity-specific input cut is assumed
 * to touch, and share of its contribution one commodity-specific output boost
 * is assumed to touch. Recipes mix several commodities and the per-commodity
 * bill is not stored, so these are deliberate round estimates.
 */
const SINGLE_COMMODITY_INPUT_SHARE = 0.25;
const SINGLE_COMMODITY_OUTPUT_SHARE = 0.5;

/** One slice of a corp's plant P&L, per turn, in the corp's currency. */
export interface TechPlantBasisSlice {
  revenue: number;
  inputs: number;
  labour: number;
}

/**
 * The plant P&L a node's effects act on. Sector-lane nodes apply only to the
 * corp's primary sector type; Corporate-lane nodes apply to every sector at
 * CORP_LANE_EFFECT_SCALE.
 */
export interface TechPlantBasis {
  primary: TechPlantBasisSlice;
  all: TechPlantBasisSlice;
}

function effectValuePerTurn(effect: TechEffect, slice: TechPlantBasisSlice): number {
  const contribution = Math.max(0, slice.revenue - slice.inputs);
  switch (effect.kind) {
    case "laborCostReduction":
      return effect.pct * slice.labour;
    case "inputEfficiency":
      return effect.pct * slice.inputs;
    case "plantOutput":
      // More output earns its revenue but also buys its inputs.
      return effect.pct * contribution;
    case "inputCost":
      return effect.pct * slice.inputs * SINGLE_COMMODITY_INPUT_SHARE;
    case "outputRate":
      return effect.pct * contribution * SINGLE_COMMODITY_OUTPUT_SHARE;
    default:
      return 0;
  }
}

/**
 * Estimated per-turn money a node is worth to the corp (corp currency): the
 * saving or extra contribution its running effects produce on the plants they
 * apply to. 0 for nodes whose effects have no running value.
 */
export function techNodeValuePerTurn(node: TechTreeNode, basis: TechPlantBasis): number {
  const generic = node.lane === "generic";
  const slice = generic ? basis.all : basis.primary;
  const scale = generic ? CORP_LANE_EFFECT_SCALE : 1;
  let value = 0;
  for (const effect of node.effects) value += effectValuePerTurn(effect, slice) * scale;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Minimum cash price of a tech node in 2019 anchor money, before era scaling.
 * Ticket #1506: pricing purely off revenue let a corp with no revenue unlock
 * nodes for R&D points alone. The floor is multiplied by the world's era unit
 * scale (2019 = 1.0) and converted into the corp's currency, so it is about
 * 5M in 2019, a fraction of that in the 1950s and a little more in the 2020s.
 * Large corps already pay far more than this and are unaffected.
 */
export const TECH_NODE_CASH_FLOOR_ANCHOR = 5_000_000;

/** Era-scaled floor in anchor money. Bad scales fall back to 2019 (1.0). */
export function techNodeCashFloorAnchor(eraUnitScale: number): number {
  const scale = Number.isFinite(eraUnitScale) && eraUnitScale > 0 ? eraUnitScale : 1;
  return TECH_NODE_CASH_FLOOR_ANCHOR * scale;
}

/**
 * Cash cost (local currency) to unlock `node`. With a plant basis and a node
 * that has running value: that value times TECH_NODE_PAYBACK_TURNS. Otherwise
 * the revenue fraction of daily gross. Never below `cashFloorLocal` (the
 * era-scaled minimum already converted into the corp's currency). Rounded;
 * never negative. rdScore is charged separately.
 */
export function techNodeCashCost(
  node: TechTreeNode,
  dailyGrossRevenueLocal: number,
  cashFloorLocal = 0,
  plantBasis?: TechPlantBasis | null
): number {
  const floor = Number.isFinite(cashFloorLocal) ? Math.max(0, cashFloorLocal) : 0;
  const value = plantBasis ? techNodeValuePerTurn(node, plantBasis) : 0;
  if (value > 0) return Math.round(Math.max(value * TECH_NODE_PAYBACK_TURNS, floor));
  const fraction = node.cashRevenueFraction ?? TECH_NODE_CASH_REVENUE_FRACTION;
  const revenueCost = Math.max(0, dailyGrossRevenueLocal * fraction);
  return Math.round(Math.max(revenueCost, floor));
}
