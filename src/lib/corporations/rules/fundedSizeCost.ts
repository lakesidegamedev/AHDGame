/**
 * Size costs on the funded producer path. The margin stack carries overhead,
 * state-owned sprawl and the running dominance cost, but a funded sector takes
 * revenue, costs and margin from its settled receipt, so those legs would
 * vanish at the cutover. This turns them into one charge, in points of
 * revenue, that `fundedSectorResult` adds to the receipt's costs.
 *
 * Margin-stack legs are signed: a drag is negative. The result is a positive
 * cost in points of revenue, never a credit.
 */
export function fundedSizeCostPp(args: {
  stateOwned: boolean;
  /** gameConfig.fundedOverheadStage; private overhead rides along from stage 1. */
  overheadStage: number;
  /** Management overhead leg of the margin stack (negative or 0). */
  overheadMod: number;
  /** Sprawl leg (negative or 0); only a state-owned corporation's carries over. */
  sprawlMod: number;
  /** Dominance margin penalty after the plants fade and running scale (negative or 0). */
  dominancePenalty: number;
}): number {
  // State-owned overhead is already zero unless the SOE size cost is on, so it
  // needs no stage of its own.
  const overhead = args.stateOwned || args.overheadStage >= 1 ? args.overheadMod : 0;
  const sprawl = args.stateOwned ? args.sprawlMod : 0;
  return Math.max(0, -(overhead + sprawl + args.dominancePenalty));
}
