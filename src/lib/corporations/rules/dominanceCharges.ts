/**
 * What holding a market costs a funded site, in two separate charges.
 *
 * Monopoly charge: a cut of the site's sold revenue. The state part follows the
 * company's share of the site's own state and sector; the country part follows
 * its share of the whole country and sector, so it reaches every site there.
 * The two add.
 *
 * Dominance cost: extra operating cost on a site in a state the company
 * dominates. It follows the state share only; there is no country version.
 *
 * Pure: plain data in, plain data out.
 */
import {
  getDominanceMarginPenalty,
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
  return Math.max(0, -getDominanceMarginPenalty(finite(input.localSharePct))) * open(input.shield);
}
