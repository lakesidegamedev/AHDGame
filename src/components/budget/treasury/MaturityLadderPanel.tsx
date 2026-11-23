"use client";

import {
  maturityLadderHighlights,
  type MaturityLadderYear,
  type SovereignMaturityLadder,
} from "@/lib/budget/rules/maturityLadder";
import { formatFundsCompact } from "@/lib/utils/formatters";

interface MaturityLadderPanelProps {
  ladder: SovereignMaturityLadder;
  sym: string;
}

const pct = (value: number) =>
  value > 0 && value < 0.001 ? "<0.1%" : `${(value * 100).toFixed(1)}%`;

const yearLabel = (year: MaturityLadderYear) =>
  year.fyOffset === 0 ? "This fiscal year" : `FY+${year.fyOffset}`;

const gapBp = (year: MaturityLadderYear) => Math.round(year.repricingGapPct * 100);

/** Names the years worth acting on, not just how much reprices soon. */
function repricingHeadline(ladder: SovereignMaturityLadder): string {
  const { largestShare, widestGap } = maturityLadderHighlights(ladder);
  if (!largestShare) return "No sovereign face matures inside the horizon.";
  const most = `${yearLabel(largestShare)} reprices the most stock (${pct(largestShare.share)})`;
  if (!widestGap || gapBp(widestGap) <= 0) {
    return `${most}; no year reprices meaningfully above its own coupons.`;
  }
  if (widestGap.fyOffset === largestShare.fyOffset) {
    return `${most}, at the widest gap (+${gapBp(widestGap)} bp).`;
  }
  return `${most}; ${yearLabel(widestGap)} carries the widest gap (+${gapBp(widestGap)} bp).`;
}

/**
 * How much of the sovereign stock reprices each fiscal year, the coupon it pays
 * on average and today's rate. The trajectory premium only lands through these
 * rollovers, so a ladder full of near-term maturities is why a rate move shows
 * up quickly.
 */
export function MaturityLadderPanel({ ladder, sym }: MaturityLadderPanelProps) {
  const years = ladder.years.filter((year) => year.principal > 0);
  if (ladder.totalPrincipal <= 0) return null;

  const maxPrincipal = Math.max(
    ...ladder.years.map((year) => year.principal),
    ladder.beyondPrincipal,
    1
  );

  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <div className="text-sm font-semibold text-foreground">Refinancing ladder</div>
      <p className="mt-0.5 text-[11px] tabular-nums text-muted">{repricingHeadline(ladder)}</p>

      <div className="mt-2 space-y-1.5">
        {years.map((year) => {
          const gapBp = Math.round(year.repricingGapPct * 100);
          return (
            <div key={year.fyOffset} className="text-body-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted">
                  {year.fyOffset === 0 ? "This fiscal year" : `FY+${year.fyOffset}`}
                </span>
                <span className="tabular-nums text-foreground">
                  {formatFundsCompact(year.principal, sym)}{" "}
                  <span className="text-muted">({pct(year.share)})</span>
                </span>
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-card-muted">
                <div
                  className="h-full rounded bg-primary/60"
                  style={{ width: `${Math.max(1, (year.principal / maxPrincipal) * 100)}%` }}
                />
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px] text-muted">
                <span>
                  coupons {formatFundsCompact(year.couponCost, sym)}/yr at{" "}
                  {year.averageCouponPct.toFixed(2)}% average
                </span>
                <span className={gapBp > 0 ? "text-warning" : "text-muted"}>
                  {ladder.todayRatePct.toFixed(2)}% new borrowing ({gapBp > 0 ? "+" : ""}
                  {gapBp} bp)
                </span>
              </div>
            </div>
          );
        })}

        {ladder.beyondPrincipal > 0 && (
          <div className="flex items-baseline justify-between border-t border-card-border/60 pt-1.5 text-body-sm">
            <span className="text-muted">Later</span>
            <span className="tabular-nums text-muted">
              {formatFundsCompact(ladder.beyondPrincipal, sym)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-card-border/60 pt-1.5 text-body-sm">
        <span className="text-muted">Coupons on the whole stock</span>
        <span className="tabular-nums text-foreground">
          {formatFundsCompact(ladder.totalCouponCost, sym)}/yr{" "}
          <span className="text-muted">({ladder.averageCouponPct.toFixed(2)}% average)</span>
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        These coupons, rows above plus later maturities, are the debt interest the budget charges.
        A thin row is simply a bond that happens to mature that year, not a gap in the data.
      </p>

      <p className="mt-2 text-[11px] text-muted">
        Maturing face moves to the new borrowing rate at rollover; the trajectory premium lands
        through these coupons, not on the whole stock at once.
      </p>
    </div>
  );
}
