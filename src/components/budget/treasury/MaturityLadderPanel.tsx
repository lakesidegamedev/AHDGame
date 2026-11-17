"use client";

import type { SovereignMaturityLadder } from "@/lib/budget/rules/maturityLadder";
import { formatFundsCompact } from "@/lib/utils/formatters";

interface MaturityLadderPanelProps {
  ladder: SovereignMaturityLadder;
  sym: string;
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

/**
 * How much of the sovereign stock reprices each fiscal year, and what the same
 * face would cost at today's rate. The trajectory premium only lands through
 * these rollovers, so a ladder full of near-term maturities is why a rate move
 * shows up quickly.
 */
export function MaturityLadderPanel({ ladder, sym }: MaturityLadderPanelProps) {
  const years = ladder.years.filter((year) => year.principal > 0);
  if (ladder.totalPrincipal <= 0) return null;

  const maxPrincipal = Math.max(
    ...ladder.years.map((year) => year.principal),
    ladder.beyondPrincipal,
    1
  );
  const nearTermShare = ladder.years
    .filter((year) => year.fyOffset <= 2)
    .reduce((sum, year) => sum + year.share, 0);

  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">Refinancing ladder</div>
        <div className="text-[11px] tabular-nums text-muted">
          {pct(nearTermShare)} of the stock reprices within two years
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {years.map((year) => {
          const delta = year.repricedCost - year.couponCost;
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
              <div className="mt-0.5 flex items-baseline justify-between text-[10px] text-muted">
                <span>coupons {formatFundsCompact(year.couponCost, sym)}/yr at issued rates</span>
                <span className={delta > 0 ? "text-warning" : "text-muted"}>
                  {delta > 0 ? "+" : ""}
                  {formatFundsCompact(delta, sym)}/yr at {ladder.todayRatePct.toFixed(2)}%
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

      <p className="mt-2 text-[11px] text-muted">
        Maturing face moves to today&apos;s effective rate at rollover; the trajectory premium lands
        through these coupons, not on the whole stock at once.
      </p>
    </div>
  );
}
