/**
 * What holding a market costs a funded site. Monopoly charge: a cut of sold
 * revenue; the state part follows the share of the site's state and sector,
 * the country part the share of the country and sector, and the two add.
 * Dominance cost: extra running cost on a site in a state the company
 * dominates, by state share only. Pure: plain data in, plain data out.
 */
import {
  DOMINANCE_COST_PCT_AT_FULL,
  DOMINANCE_MARKET_SHARE_THRESHOLD,
} from "@/lib/constants/corporationsTables";
import {
  getDominanceRegulatoryBurden,
  getNationalDominanceRegulatoryBurden,
} from "@/lib/corporations/rules/corporationEconomy";

interface ShareInput {
  /** Company (control group) share of the site's state and sector, 0 to 100. */
  localSharePct: number;
  /** Company (control group) share of the country and sector, 0 to 100. */
  nationalSharePct: number;
  /** Tech dominance shield, 0 to 1. */
  shield: number;
  stateOwned: boolean;
}

const finite = (x: number): number => (Number.isFinite(x) ? x : 0);
const open = (shield: number): number => 1 - Math.min(1, Math.max(0, finite(shield)));

/** Share of sold revenue the monopoly charge takes, in points (0 or positive). */
export function monopolyChargePct(input: ShareInput): number {
  if (input.stateOwned) return 0;
  const rate =
    getDominanceRegulatoryBurden(finite(input.localSharePct)) +
    getNationalDominanceRegulatoryBurden(finite(input.nationalSharePct));
  return Math.max(0, rate) * 100 * open(input.shield);
}

/** Percent added to the site's operating costs by state dominance (0 or positive). */
export function dominanceCostPct(input: Omit<ShareInput, "nationalSharePct">): number {
  if (input.stateOwned) return 0;
  const share = Math.min(100, finite(input.localSharePct));
  if (share <= DOMINANCE_MARKET_SHARE_THRESHOLD) return 0;
  const progress =
    (share - DOMINANCE_MARKET_SHARE_THRESHOLD) / (100 - DOMINANCE_MARKET_SHARE_THRESHOLD);
  return progress * DOMINANCE_COST_PCT_AT_FULL * open(input.shield);
}
