"use client";

import type { ReactNode } from "react";
import type { CreditRating } from "@/lib/db/types/budget";
import { formatFundsCompact } from "@/lib/utils/formatters";
import { Delta, Sparkline } from "./primitives";

/**
 * Debt & credit panel (ported from the design prototype `bdebt.jsx`): the
 * sovereign balance sheet — principal, debt-to-GDP, effective rate, ceiling —
 * with a 0–200% debt-to-GDP scale + threshold ticks, ceiling-use readout, and a
 * debt-to-GDP trend sparkline from FY snapshots.
 */

// Mirrors src/lib/budget/debt.ts thresholds.
const DG_THRESHOLDS = [
  { ratio: 0.6, label: "60%" },
  { ratio: 0.8, label: "80%" },
  { ratio: 1.0, label: "100%" },
  { ratio: 1.2, label: "120%" },
  { ratio: 1.5, label: "150%" },
];

function ratingClasses(rating: CreditRating): string {
  if (rating === "AAA" || rating === "AA") return "border-success/40 bg-success/10 text-success";
  if (rating === "A") return "border-gold/40 bg-gold/10 text-gold";
  if (rating === "BBB") return "border-warning/40 bg-warning/10 text-warning";
  return "border-error/40 bg-error/10 text-error";
}

function KV({
  label,
  value,
  delta,
  title,
  sub,
}: {
  label: string;
  value: string;
  delta?: ReactNode;
  title?: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-body-sm font-medium text-muted" title={title}>
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-mono text-body font-bold tabular-nums text-foreground">{value}</span>
        {delta}
      </div>
      {sub ? <div className="mt-0.5 text-body-sm leading-snug text-muted">{sub}</div> : null}
    </div>
  );
}

interface DebtCreditPanelProps {
  sym: string;
  principal: number;
  /** The rate new borrowing would pay today, from the "Why this rate" table. */
  interestRate: number;
  /** New-borrowing rate stored at the last rollover; shown only when it differs. */
  bookedRate?: number;
  /** Annual interest the budget charges. Its ratio to principal is the rate actually paid. */
  debtInterest?: number;
  ceiling: number;
  ceilingLabel: string;
  debtToGdp: number;
  /** Smoothed GDP the debt-to-GDP ratio divides by, in local currency. */
  ratioGdp?: number;
  rating: CreditRating;
  /** Debt-to-GDP percentages over the FY history, for the trend sparkline. */
  trend: number[];
  /** FY range label for the trend caption (e.g. "FY2021–FY2026"). */
  trendRange: string;
  compare?: boolean;
  /** Prior-FY debt-to-GDP ratio for the compare delta. */
  prevDebtToGdp?: number | null;
}

export function DebtCreditPanel({
  sym,
  principal,
  interestRate,
  bookedRate,
  debtInterest,
  ceiling,
  ceilingLabel,
  debtToGdp,
  ratioGdp,
  rating,
  trend,
  trendRange,
  compare = false,
  prevDebtToGdp,
}: DebtCreditPanelProps) {
  const money = (n: number) => formatFundsCompact(n, sym);
  const dgMax = 2.0;
  const ceilingUse = ceiling > 0 ? principal / ceiling : 0;
  const barFill = (Math.min(debtToGdp, dgMax) / dgMax) * 100;
  const barTone =
    debtToGdp > 1.2 ? "bg-error/60" : debtToGdp > 0.8 ? "bg-warning/60" : "bg-success/60";
  const trendColor = debtToGdp > 1.2 ? "#ef4444" : debtToGdp > 0.8 ? "#eab308" : "#22c55e";

  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-body font-semibold text-foreground">Debt &amp; credit</div>
        <span
          title="Sovereign credit rating, set from debt-to-GDP and the country's sovereign risk anchor. The bond pages show this same rating."
          className={`rounded-full border px-2 py-0.5 text-body-sm font-semibold ${ratingClasses(rating)}`}
        >
          {rating}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KV label="Debt principal" value={money(principal)} />
        <KV
          label="Debt-to-GDP"
          title="Outstanding bond principal divided by smoothed budget GDP, not headline GDP, so it can differ slightly from principal over the GDP shown elsewhere."
          value={`${(debtToGdp * 100).toFixed(1)}%`}
          sub={ratioGdp && ratioGdp > 0 ? `of smoothed budget GDP ${money(ratioGdp)}` : undefined}
          delta={
            compare ? (
              <Delta
                now={debtToGdp * 100}
                prev={prevDebtToGdp != null ? prevDebtToGdp * 100 : null}
                kind="pct"
                invert
              />
            ) : undefined
          }
        />
        {debtInterest != null && principal > 0 && (
          <KV
            label="Average rate paid"
            value={`${((debtInterest / principal) * 100).toFixed(2)}%`}
          />
        )}
        <KV label="New borrowing rate" value={`${(interestRate * 100).toFixed(2)}%`} />
        {bookedRate != null && Math.abs(bookedRate - interestRate) > 0.00005 && (
          <KV
            label="New borrowing rate at last rollover"
            value={`${(bookedRate * 100).toFixed(2)}%`}
          />
        )}
        <KV label={ceilingLabel} value={money(ceiling)} />
      </div>

      <p className="mt-2 text-body-sm text-muted">
        Interest is charged at the coupons the existing bonds were issued at, so the average rate
        paid sits between old and new rates. The new borrowing rate is what bonds issued or rolled
        over today would pay.
      </p>

      {/* Debt-to-GDP scale */}
      <div className="mt-4">
        <div className="relative h-4 w-full overflow-hidden rounded bg-card-muted">
          <div className={`h-full transition-all ${barTone}`} style={{ width: `${barFill}%` }} />
        </div>
        <div className="relative mt-0.5 h-4 text-body-sm text-muted">
          {DG_THRESHOLDS.map((t) => (
            <span
              key={t.label}
              className="absolute -translate-x-1/2"
              style={{ left: `${(t.ratio / dgMax) * 100}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-body-sm text-muted">D/G scale · 0–200%</span>
          <span className="text-body-sm text-muted">
            Ceiling use{" "}
            <span
              className={`font-semibold ${ceilingUse > 0.95 ? "text-error" : ceilingUse > 0.85 ? "text-warning" : "text-foreground"}`}
            >
              {(ceilingUse * 100).toFixed(0)}%
            </span>
          </span>
        </div>
      </div>

      {/* Debt trend */}
      {trend.length > 1 && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-card-border bg-card-muted p-3">
          <div>
            <div className="text-body-sm font-medium text-muted">Debt-to-GDP trend</div>
            <div className="text-body-sm text-muted">{trendRange}</div>
          </div>
          <Sparkline data={trend} w={180} h={42} color={trendColor} />
        </div>
      )}
    </div>
  );
}
