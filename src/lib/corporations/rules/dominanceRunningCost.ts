/**
 * The dominance margin penalty (pp, negative) a sector pays this turn.
 *
 * `runningScale` is the floor on the plants fade, so a group holding the market
 * keeps paying a fraction for as long as it holds it. The penalty curve itself
 * already falls to zero at the share threshold, so the cost fades as share falls
 * without any extra mechanism.
 */
import {
  getDominanceMarginPenalty,
  getNationalDominanceMarginPenalty,
} from "@/lib/constants/corporations";

export function appliedDominanceMarginPenalty(args: {
  localSharePct: number;
  nationalSharePct: number;
  /** Tech dominance shield, 0 to 1. */
  shield: number;
  plantsEnabled: boolean;
  plantsRampLambda: number;
  /** gameConfig.dominanceRunningCostScale; 0 = off. */
  runningScale: number;
}): number {
  const base = Math.min(
    getDominanceMarginPenalty(args.localSharePct),
    getNationalDominanceMarginPenalty(args.nationalSharePct)
  );
  const plantsFade = args.plantsEnabled
    ? Math.max(1 - args.plantsRampLambda, args.runningScale)
    : 1;
  return base * (1 - args.shield) * plantsFade;
}
