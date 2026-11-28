/** The lead between the yes and no shares of a two-option referendum. */
export function referendumLeadMargin(yesShare: number): number {
  return Math.abs(yesShare - (100 - yesShare));
}
