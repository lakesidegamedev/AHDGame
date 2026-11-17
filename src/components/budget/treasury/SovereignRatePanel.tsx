"use client";

import { explainSovereignRate, type SovereignRateInputs } from "@/lib/budget/rules/sovereignRate";

interface SovereignRatePanelProps {
  current: SovereignRateInputs;
  /** Prior fiscal close, when enough of its inputs were recorded. */
  previous: SovereignRateInputs | null;
}

const pct = (rate: number) => `${(rate * 100).toFixed(2)}%`;

function deltaTone(current: number, previous: number | null): string {
  if (previous === null) return "text-muted";
  if (current > previous + 0.00005) return "text-warning";
  if (current < previous - 0.00005) return "text-success";
  return "text-muted";
}

function Row({
  label,
  current,
  previous,
  showDelta = true,
}: {
  label: string;
  current: number;
  previous: number | null;
  showDelta?: boolean;
}) {
  const delta = previous === null ? null : current - previous;
  return (
    <div className="grid grid-cols-[minmax(8rem,1.4fr)_auto_auto_4.5rem] items-baseline gap-x-3 border-b border-card-border/60 py-1.5 text-body-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right tabular-nums text-foreground">{pct(current)}</span>
      <span className="text-right tabular-nums text-muted">
        {previous === null ? "n/a" : pct(previous)}
      </span>
      <span
        className={`text-right tabular-nums ${showDelta ? deltaTone(current, previous) : "text-muted"}`}
      >
        {delta === null
          ? ""
          : `${delta > 0.00005 ? "+" : delta < -0.00005 ? "-" : ""}${Math.abs(delta * 100).toFixed(2)}pp`}
      </span>
    </div>
  );
}

/**
 * Why the sovereign pays what it pays: the level ladder, the investor confidence
 * premium, the debt trajectory premium and any cap, with the prior close beside
 * it. Computed from the same composer the fiscal-year rollover charges from, so
 * the rows always add up to the effective rate.
 */
export function SovereignRatePanel({ current, previous }: SovereignRatePanelProps) {
  const now = explainSovereignRate(current);
  const before = previous ? explainSovereignRate(previous) : null;

  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">Why this rate</div>
        <div className="text-[11px] text-muted">current close against the prior fiscal year</div>
      </div>

      <div className="mt-2 grid grid-cols-[minmax(8rem,1.4fr)_auto_auto_4.5rem] gap-x-3 border-b border-card-border pb-1 text-[11px] text-muted">
        <span>Component</span>
        <span className="text-right">This close</span>
        <span className="text-right">Prior close</span>
        <span className="text-right">Change</span>
      </div>

      <Row
        label={`Ladder (${now.ladderRating})`}
        current={now.ladderRate}
        previous={before?.ladderRate ?? null}
      />
      <Row
        label="Investor confidence"
        current={now.confidencePremium}
        previous={before?.confidencePremium ?? null}
      />
      <Row
        label="Debt trajectory"
        current={now.trajectoryPremium}
        previous={before?.trajectoryPremium ?? null}
      />
      <Row
        label="Effective rate"
        current={now.effectiveRate}
        previous={before?.effectiveRate ?? null}
      />

      <div className="mt-2 space-y-0.5 text-[11px] text-muted">
        {now.imfCapApplied && (
          <p>The IMF programme caps the ladder at {pct(now.afterImfCapRate)}.</p>
        )}
        {now.maxCapApplied && <p>The hard sovereign ceiling trimmed the sum.</p>}
        <p>
          The ladder prices today&apos;s debt ratio; the other two rows are premiums on top of it. A
          negative trajectory row is a discount for a ratio that is falling.
        </p>
        {!before && <p>No prior close carried enough detail to break down.</p>}
      </div>
    </div>
  );
}
