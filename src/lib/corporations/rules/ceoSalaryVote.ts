/**
 * When a CEO pay rise needs a shareholder vote (contestability plan, workstream
 * 7). A player CEO could set the salary to 1.25x daily gross revenue with no
 * approval. From `gameConfig.ceoSalaryVoteNetIncomeShare` a rise that takes pay
 * above that share of trailing daily net income goes to the shareholders;
 * lowering pay and rises within the share stay free. With no positive net
 * income there is no share to measure against, so any rise needs a vote.
 */

export const DAYS_PER_YEAR = 365;

/** Trailing average daily net income, from the rolling log of annualised after-tax income. */
export function trailingDailyNetIncome(earningsHistory: readonly number[] | undefined): number {
  const finite = (earningsHistory ?? []).filter((n) => Number.isFinite(n));
  if (finite.length === 0) return 0;
  const annualAverage = finite.reduce((sum, n) => sum + n, 0) / finite.length;
  return annualAverage / DAYS_PER_YEAR;
}

export interface CeoSalaryVoteCheck {
  required: boolean;
  /** Highest salary allowed without a vote, in the same units as the inputs. */
  freeCeiling: number;
  /** True when the ceiling is the current salary because there is no positive net income. */
  noPositiveNetIncome: boolean;
}

export function ceoSalaryVoteCheck(args: {
  currentSalary: number;
  newSalary: number;
  trailingDailyNetIncome: number;
  /** gameConfig.ceoSalaryVoteNetIncomeShare; 0 or less = off. */
  share: number;
}): CeoSalaryVoteCheck {
  const current = Math.max(0, args.currentSalary);
  if (!(args.share > 0) || !(args.newSalary > current)) {
    return { required: false, freeCeiling: Infinity, noPositiveNetIncome: false };
  }
  const noPositiveNetIncome = !(args.trailingDailyNetIncome > 0);
  // Pay already above the share stays where it is; only a rise past the larger
  // of the share and today's pay needs approval.
  const freeCeiling = noPositiveNetIncome
    ? current
    : Math.max(current, args.trailingDailyNetIncome * args.share);
  return { required: args.newSalary > freeCeiling, freeCeiling, noPositiveNetIncome };
}
