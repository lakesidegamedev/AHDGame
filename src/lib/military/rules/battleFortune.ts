/** Apply symmetric reserve leverage without privileging the attacker role. */
export function applyReserveOdds(
  forceRatio: number,
  attackerReserve: number,
  defenderReserve: number
): number {
  const ratio = Number.isFinite(forceRatio) ? Math.max(0, Math.min(1, forceRatio)) : 0.5;
  const attacker = Number.isFinite(attackerReserve) ? Math.max(0, Math.min(1, attackerReserve)) : 0;
  const defender = Number.isFinite(defenderReserve) ? Math.max(0, Math.min(1, defenderReserve)) : 0;
  const leverage = 0.1 * (1 - Math.abs(ratio - 0.5) * 2);
  return Math.max(0.02, Math.min(0.98, ratio + attacker * leverage - defender * leverage));
}

/**
 * Preserve the outcome-calibrating fortune draw while capping how destructive a
 * lucky day can make the five-round attrition exchange.
 */
export function battleEffectiveRatio(
  projectedRatio: number,
  fortuneRoll: number,
  outcomeSpread: number,
  severitySpread: number
): number {
  const ratio = Number.isFinite(projectedRatio) ? Math.max(0, Math.min(1, projectedRatio)) : 0.5;
  const roll = Number.isFinite(fortuneRoll) ? Math.max(0, Math.min(1, fortuneRoll)) : 0.5;
  const spread = Number.isFinite(outcomeSpread) ? Math.max(0, outcomeSpread) : 0;
  const severity = Number.isFinite(severitySpread) ? Math.max(0, Math.min(0.5, severitySpread)) : 0;
  const outcomeRatio = ratio + (roll - 0.5) * 2 * spread;
  return 0.5 + Math.max(-severity, Math.min(severity, outcomeRatio - 0.5));
}

/**
 * How much of a normal battle's bleeding a side takes, given the share of the
 * front's combined fighting power its ENEMY holds.
 *
 * Casualties used to scale with a side's own deployed personnel almost regardless of
 * the force gap, so a huge army facing a thin defence lost many times more men than the
 * defender. Scaling by the enemy's engaged share fixes that: at parity (enemy share
 * 0.5) the factor is 1 and the calibrated even-fight losses are untouched; the smaller
 * the enemy's share, the smaller the factor, down to `floor` so a battle never costs
 * nothing. Capped at 1: facing the stronger side never bleeds MORE than before.
 */
export function enemyEngagedExposure(enemyShare: number, floor: number): number {
  const share = Number.isFinite(enemyShare) ? Math.max(0, Math.min(1, enemyShare)) : 0.5;
  const lowest = Number.isFinite(floor) ? Math.max(0, Math.min(1, floor)) : 0;
  return Math.max(lowest, Math.min(1, share / 0.5));
}
