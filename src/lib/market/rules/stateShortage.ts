/**
 * How many states are short of a good that trades only inside each state
 * (healthcare, real estate, construction, freight; see commodityMarketScope).
 *
 * The world figure adds every state's book together, so "83% short" can sit on
 * top of a state whose own book is full: a plant there has no buyers to reach,
 * because buyers elsewhere cannot buy from it. Counting the short states says
 * where the shortage actually is.
 *
 * Pure: per-state supply and demand in, counts out.
 */

/** Supply below this share of demand reads as short, as on the market list. */
export const STATE_SHORT_SUPPLY_RATIO = 0.95;

export interface StateShortage {
  /** States whose own supply covers less than STATE_SHORT_SUPPLY_RATIO of demand. */
  shortStates: number;
  /** States with any supply or demand of this good. */
  tradingStates: number;
}

function positive(x: number | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

export function stateShortage(
  stateSupply: Readonly<Record<string, number>>,
  stateDemand: Readonly<Record<string, number>>,
  include: (stateId: string) => boolean = () => true
): StateShortage {
  let shortStates = 0;
  let tradingStates = 0;
  for (const stateId of new Set([...Object.keys(stateSupply), ...Object.keys(stateDemand)])) {
    if (!include(stateId)) continue;
    const supply = positive(stateSupply[stateId]);
    const demand = positive(stateDemand[stateId]);
    if (supply <= 0 && demand <= 0) continue;
    tradingStates++;
    if (demand > 0 && supply < demand * STATE_SHORT_SUPPLY_RATIO) shortStates++;
  }
  return { shortStates, tradingStates };
}
