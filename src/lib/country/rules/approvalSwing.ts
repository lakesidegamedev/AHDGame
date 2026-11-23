/**
 * Approval swings worth a headline: a government's approval moving a long way
 * in a single turn. Pure: plain data in, plain data out.
 */

/** Points of approval, up or down in one turn, that make the news. */
export const APPROVAL_SWING_NEWS_POINTS = 5;

export interface ApprovalSwingInput {
  countryName: string;
  /** Approval, percent, before and after the turn's snapshot. */
  before: number;
  after: number;
  headName?: string | null;
}

export interface ApprovalSwingStory {
  title: string;
  content: string;
}

export function approvalSwingStory(input: ApprovalSwingInput): ApprovalSwingStory | null {
  const { before, after, countryName, headName } = input;
  if (![before, after].every(Number.isFinite)) return null;
  const change = after - before;
  if (Math.abs(change) < APPROVAL_SWING_NEWS_POINTS) return null;
  const points = Math.abs(change).toFixed(1);
  const leader = headName ? ` for ${headName}'s government` : " for the government";
  const fell = change < 0;
  return {
    title: fell
      ? `${countryName} approval drops ${points} points`
      : `${countryName} approval jumps ${points} points`,
    content:
      `Approval${leader} in ${countryName} ${fell ? "fell" : "rose"} from ${before.toFixed(1)}% to ${after.toFixed(1)}% in a single turn, ` +
      `a ${points}-point ${fell ? "drop" : "gain"}. ` +
      `The country page breaks the rating down into the regional scores and national effects behind it.`,
  };
}
