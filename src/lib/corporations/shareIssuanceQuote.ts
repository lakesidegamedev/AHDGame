/**
 * Preview of a public share issue. New shares sell at the current price and the
 * cash joins the company, so the value behind each share only moves when the
 * sale price differs from it.
 */
export interface ShareIssuanceQuote {
  newShares: number;
  newTotalShares: number;
  proceeds: number;
  /** Price per share after the issue, counting the proceeds as company value. */
  priceAfterIssue: number;
  priceChangePct: number;
  /** Share of the enlarged company that existing holders give up. */
  ownershipGivenUpPct: number;
}

export function quoteShareIssuance(input: {
  sharePrice: number;
  totalShares: number;
  issuePercent: number;
}): ShareIssuanceQuote {
  const { sharePrice, totalShares } = input;
  const newShares = Math.max(0, Math.floor((input.issuePercent / 100) * totalShares));
  const newTotalShares = totalShares + newShares;
  const proceeds = newShares * sharePrice;
  const priceAfterIssue =
    newTotalShares > 0 ? (sharePrice * totalShares + proceeds) / newTotalShares : sharePrice;
  return {
    newShares,
    newTotalShares,
    proceeds,
    priceAfterIssue,
    priceChangePct: sharePrice > 0 ? ((priceAfterIssue - sharePrice) / sharePrice) * 100 : 0,
    ownershipGivenUpPct: newTotalShares > 0 ? (newShares / newTotalShares) * 100 : 0,
  };
}
