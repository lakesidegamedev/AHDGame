/**
 * Which trade lookups a corporation turn should build.
 *
 * Two different things used to share one condition:
 *
 * - **Country clearing books** are a partition of the market. They only make
 *   sense on era worlds, where the unit basis is not 1 and a single worldwide
 *   book would erase the era's geography. Modern worlds keep one world book on
 *   purpose (see `market/tradePartition.ts`).
 * - **Route eligibility** is a rule about who may buy from whom. It does not
 *   partition anything: it filters offers inside whichever book the sale clears
 *   in. An embargo is exactly this kind of rule.
 *
 * The old `eraUnitScale !== 1` test covered both, so on every modern world the
 * affinity graph was never built, `producerTurnDemand` never filled
 * `eligibleOfferIds`, and a targeted embargo had no effect on a sale. Only a
 * comprehensive both-direction embargo did anything, by a separate legacy path.
 *
 * So: build the affinity graph whenever the world is an era world OR an active
 * block embargo exists. Build the country books only when the world is an era
 * world.
 *
 * Only a block embargo counts. Route eligibility is a yes or no per lane, so it
 * can carry a block but not a cap: a cap-mode embargo would switch the graph on
 * and filter nothing. Caps still apply on era worlds through the country books.
 *
 * The embargo test is what makes this safe to ship. A world with no active
 * block embargo builds exactly what it built before, so there is no new work
 * and no change in behavior. A world that passed one gets the rule it voted for.
 *
 * Funded tariffs (gameConfig.producerTariffStage) need the graph as well: it
 * carries each route's tariff and the blockade closure. With the stage on the
 * graph is built on every world; the country books still follow the era.
 *
 * Pure: plain numbers and a count in, booleans out.
 */

export interface TradeEligibilityScopeInput {
  /** The world's era unit-basis scale. Exactly 1 for every modern preset. */
  eraUnitScale: number;
  /** Active (non-expired) block-mode trade embargoes for this turn. */
  activeBlockEmbargoCount: number;
  /** gameConfig.producerTariffStage >= 1: the funded market charges import tariffs. */
  fundedTariffs?: boolean;
}

export interface TradeEligibilityScope {
  /** Build the affinity graph that fills route eligibility. */
  routes: boolean;
  /** Build the per-country clearing books. Era worlds only. */
  countryBooks: boolean;
}

export function tradeEligibilityScope(input: TradeEligibilityScopeInput): TradeEligibilityScope {
  const eraWorld = input.eraUnitScale !== 1;
  const hasBlock =
    Number.isFinite(input.activeBlockEmbargoCount) && input.activeBlockEmbargoCount > 0;
  return {
    routes: eraWorld || hasBlock || input.fundedTariffs === true,
    countryBooks: eraWorld,
  };
}

/** Embargoes route eligibility can enforce: block mode, or legacy rows without a mode. */
export function countBlockEmbargoes(embargoes: readonly { mode?: string }[]): number {
  return embargoes.filter((e) => e.mode !== "cap").length;
}
