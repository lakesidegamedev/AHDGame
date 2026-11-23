/**
 * One credit rating and composite for a corporation, shared by every screen
 * that shows them (masthead, Overview, Financials, Credit, Bonds).
 *
 * The live figures win: they are what a new bond issue is priced on, and they
 * equal the last turn's snapshot whenever nothing has changed since. The
 * snapshot only fills in when the live calculation is unavailable.
 */

export interface CreditStandingInput {
  creditRatingSnapshot?: string | null;
  creditCompositeSnapshot?: number | null;
}

export interface LiveCreditStandingInput {
  rating?: string | null;
  compositeScore?: number | null;
}

export interface CreditStanding {
  rating: string | null;
  composite: number | null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function resolveCreditStanding(
  snapshot: CreditStandingInput | null | undefined,
  live: LiveCreditStandingInput | null | undefined
): CreditStanding {
  const rating = live?.rating || snapshot?.creditRatingSnapshot || null;
  // A live rating without a live score (a rating-only view) never borrows the
  // snapshot score unless the snapshot carries the same rating, so the pair
  // always comes from one source.
  const liveRatingOnly = !!live?.rating && !finite(live.compositeScore);
  const snapshotMatchesLive = !liveRatingOnly || snapshot?.creditRatingSnapshot === live?.rating;
  const composite = finite(live?.compositeScore)
    ? live.compositeScore
    : finite(snapshot?.creditCompositeSnapshot) && snapshotMatchesLive
      ? snapshot.creditCompositeSnapshot
      : null;
  return { rating, composite };
}

/**
 * Weighted sum of the four component scores, rounded the way the turn rounds
 * its raw composite. The turn blends this with the previous score, so the
 * published composite can differ from it by a point or two.
 */
export function weightedComponentComposite(
  components: Readonly<Record<string, number>>,
  weights: Readonly<Record<string, number>>
): number {
  let total = 0;
  for (const key of Object.keys(weights)) total += (components[key] ?? 0) * weights[key];
  return Math.round(total);
}
