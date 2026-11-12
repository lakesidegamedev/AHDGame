/**
 * Divergence: at case decision time, count seated justices (vacancies excluded)
 * on each side of the case's tagged axis. If the majority side matches the
 * authored historical-majority direction the case affirms history; otherwise it
 * diverges. Majority is a straight headcount, NOT an average of lean scores, so
 * outlier justices cannot drag the mean across the line.
 *
 * RACE/EQUALITY CASES ARE DELIBERATELY EXEMPT: Brown v. Board and the other
 * racial-equal-protection cases (see `historicalOutcomeLocked` on `DocketCase`)
 * always resolve to their real historical outcome regardless of court
 * composition. There is no alternate-history branch for these and none should
 * be added; only their downstream demographic consequences are modeled. Every
 * other case uses the composition-driven headcount below.
 */

export type CaseAxis = "economic" | "social";
export type MajorityDirection = 1 | -1;
export type CaseOutcome = "affirmed" | "diverged";

export interface SeatedJusticeLean {
  economicLean: number;
  socialLean: number;
}

export interface CaseDivergenceResult {
  /** Count of seated (non-vacant) justices considered — vacant seats never appear in this list at all. */
  seatedCount: number;
  /** Justices whose lean on the tagged axis is > 0. */
  positiveCount: number;
  /** Justices whose lean on the tagged axis is < 0. */
  negativeCount: number;
  /** Justices whose lean on the tagged axis is exactly 0 — count toward neither side of the headcount. */
  neutralCount: number;
  /**
   * The sitting majority's side on the tagged axis: 1 (positive majority), -1
   * (negative majority), or 0 when positive/negative counts are tied (or when
   * no justices are seated at all). A court that fails to produce a clear
   * majority — tied seated justices, or an empty bench — cannot hand down a
   * ruling at all, so it always affirms (upholds the existing/lower result,
   * no history divergence) — see the outcome computation.
   */
  majoritySide: MajorityDirection | 0;
  outcome: CaseOutcome;
}

export interface DecideCaseOutcomeOptions {
  /**
   * When true, `outcome` is forced to "affirmed" regardless of the computed
   * `majoritySide` — the case always resolves to its real historical result.
   * Reserved for race/equal-protection cases (see the module doc comment
   * above); every other case must omit this. The seat headcount
   * (`positiveCount`/`negativeCount`/`majoritySide`) is still computed and
   * returned honestly even when locked — only `outcome` is pinned — so the
   * sitting Court's actual composition remains visible for flavor/audit
   * purposes without ever driving a different legal result.
   */
  historicalOutcomeLocked?: boolean;
}

/**
 * Decide whether a Docket case affirms or diverges from history, given the
 * currently seated justices' leans on the case's tagged axis.
 *
 * `seatedJustices` must already exclude vacant seats — this function has no
 * concept of a seat, only of who is currently seated.
 */
export function decideCaseOutcome(
  seatedJustices: SeatedJusticeLean[],
  axis: CaseAxis,
  historicalMajorityDirection: MajorityDirection,
  options?: DecideCaseOutcomeOptions
): CaseDivergenceResult {
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  for (const justice of seatedJustices) {
    const lean = axis === "economic" ? justice.economicLean : justice.socialLean;
    if (lean > 0) positiveCount++;
    else if (lean < 0) negativeCount++;
    else neutralCount++;
  }

  const majoritySide: MajorityDirection | 0 =
    positiveCount > negativeCount ? 1 : negativeCount > positiveCount ? -1 : 0;

  // A tied or empty bench cannot overrule: majoritySide 0 must affirm.
  // Otherwise it never equals the authored ±1 direction and fires as a
  // divergence no player or NPP caused.
  const outcome: CaseOutcome =
    options?.historicalOutcomeLocked || majoritySide === 0
      ? "affirmed"
      : majoritySide === historicalMajorityDirection
        ? "affirmed"
        : "diverged";

  return {
    seatedCount: seatedJustices.length,
    positiveCount,
    negativeCount,
    neutralCount,
    majoritySide,
    outcome,
  };
}
