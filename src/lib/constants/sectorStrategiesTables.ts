export {
  CANCEL_COST_FRACTION,
  PARENT_DIRECTED_STRATEGY_PROTECTION_TURNS,
  STRATEGY_COOLDOWN_TURNS,
  STRATEGY_RETOOL_COST_FRACTION,
  STRATEGY_TRANSITION_MARGIN_PENALTY,
  STRATEGY_TRANSITION_TURNS,
} from "./sectorStrategyTypes";
export type { EffectiveStrategyRates, SectorStrategy } from "./sectorStrategyTypes";
export { SECTOR_STRATEGIES } from "./sectorStrategyDefinitions";

export interface StrategyOptions {
  /** Funded producer turns only: advertising as a paid input (see the overlay module). */
  advertisingInput?: boolean;
}

/**
 * Share of a planned economy's media output that reaches the market.
 *
 * The seeded bloc states produce about 4x what a state media budget plausibly
 * funds. Derating the market contribution is the reversible, code-side fix:
 * no mutation of live state-owned sectors. Bloc media sells advertising,
 * bought domestically by the planned-only state media line.
 */
export const PLANNED_ECONOMY_MEDIA_SUPPLY_FACTOR = 0.25;

/**
 * Share of a market economy's media output that reaches the advertising
 * market. Media nameplate is roughly 20x what the market absorbs, pinning
 * price to the deflation clamp; capacity is the only lever, since ownership
 * and output mix offer none. Derating is reversible.
 *
 * This RAISES media revenue: the glut is what impoverishes these sectors,
 * so clearing less at a recovered price beats clearing more at a third of
 * base. 0.10 is a step, not a landing. Proper fix is to right-size the seed.
 */
export const MARKET_ECONOMY_MEDIA_SUPPLY_FACTOR = 0.1;
