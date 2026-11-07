/*
 * Plants stop producing at a loss.
 *
 * The demand throttle sizes runs from sales, not profitability, so a plant
 * selling below cost runs flat out and loses money. Each turn we read last
 * turn's plant P&L and compute avoidable contribution:
 *
 *     current sales - inputs - per-unit costs (signed)
 *         - labour above the crew floor + policy credit
 *
 * Upkeep, crew floor, and inventory sell-down are excluded (not avoidable
 * by cutting output this turn). The whole output basket is judged together.
 *
 * Six turns below -5% of sales cuts the run share by 5 points per turn; six
 * turns above +5% restores it. The band and streaks prevent flapping. The share
 * scales only the market part of the throttle, so contract production is
 * untouched, and the throttle floor leaves a probe run so recovery is visible.
 */

/** Contribution below this share of sales counts as a losing turn. */
export const LOSS_RUN_CUT_BELOW = -0.05;
/** Contribution above this share of sales counts as a paying turn. */
export const LOSS_RUN_RESTORE_ABOVE = 0.05;
/** Consecutive turns on one side of the band before the run share moves. */
export const LOSS_RUN_STREAK_TURNS = 6;
/** Run share moved per turn once a streak qualifies. */
export const LOSS_RUN_STEP = 0.05;

export interface PlantsPnlLike {
  revenue: number;
  inventoryRevenue?: number | null;
  inputs: number;
  labour: number;
  otherOpex: number;
  policyCredit?: number | null;
}

/**
 * Last turn's contribution as a share of current sales, or null when the P&L
 * cannot answer (missing, stale or non-finite). A plant with costs and no sales
 * reads as -1.
 */
export function contributionShare(
  pnl: PlantsPnlLike | null | undefined,
  crewFloorShare: number
): number | null {
  if (!pnl) return null;
  const sales = pnl.revenue - (pnl.inventoryRevenue ?? 0);
  const avoidable =
    pnl.inputs +
    pnl.otherOpex +
    pnl.labour * Math.max(0, 1 - crewFloorShare) -
    (pnl.policyCredit ?? 0);
  if (![sales, avoidable].every(Number.isFinite)) return null;
  if (sales <= 0) return avoidable > 0 ? -1 : null;
  return (sales - avoidable) / sales;
}

/**
 * Next run share and signed streak (negative = losing turns, positive = paying
 * turns). A null contribution holds both, so a missing P&L never moves a plant.
 */
export function nextLossRun(args: {
  contribution: number | null;
  priorShare: number | null | undefined;
  priorStreak: number | null | undefined;
}): { share: number; streak: number } {
  const share = clampShare(args.priorShare);
  const prior = Number.isFinite(args.priorStreak) ? Math.trunc(args.priorStreak as number) : 0;
  const c = args.contribution;
  if (c === null || !Number.isFinite(c)) return { share, streak: prior };
  let streak = 0;
  if (c < LOSS_RUN_CUT_BELOW) streak = Math.min(prior, 0) - 1;
  else if (c > LOSS_RUN_RESTORE_ABOVE) streak = Math.max(prior, 0) + 1;
  if (streak <= -LOSS_RUN_STREAK_TURNS) return { share: clampShare(share - LOSS_RUN_STEP), streak };
  if (streak >= LOSS_RUN_STREAK_TURNS) return { share: clampShare(share + LOSS_RUN_STEP), streak };
  return { share, streak };
}

function clampShare(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}
