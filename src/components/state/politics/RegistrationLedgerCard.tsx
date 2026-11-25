"use client";

import type { StateRegLedgerResult } from "@/lib/states/overview/getStateRegLedger";

/**
 * Registration Ledger card. Shows the state's headline party Reg% and a compact
 * recent-movement sparkline sourced from `orgRegLedger`. Falls back to an honest
 * "not yet seeded" state when the state has no registration data — no fabricated
 * numbers (the Overview tab's RegistrationLegend follows the same rule).
 */
export function RegistrationLedgerCard({ regLedger }: { regLedger: StateRegLedgerResult }) {
  if (!regLedger.seeded || !regLedger.headline) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-5 opacity-90">
        <h3 className="text-body-lg text-muted">Registration ledger</h3>
        <div className="mt-3 flex items-center gap-3">
          <div className="text-heading font-bold tabular-nums opacity-50">—</div>
          <p className="text-body-sm leading-snug">
            Registration data is not yet seeded for this state.
          </p>
        </div>
      </div>
    );
  }

  const { headline, movement } = regLedger;
  return (
    <div className="rounded-xl border border-card-border bg-card p-5">
      <h3 className="text-body-lg text-muted">Registration ledger</h3>
      <div className="mt-3 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 text-body font-semibold"
          style={{ color: headline.color }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: headline.color }}
            aria-hidden
          />
          {headline.abbr}
        </span>
        <span className="text-heading font-semibold tabular-nums">
          {headline.regPct.toFixed(1)}%
        </span>
        <span className="text-body-sm text-muted">registration</span>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        Registration is the share of voters signed up with the party. Organization is the share of
        the ground game the party has built; the two can differ.
      </p>
      {movement.length >= 2 ? (
        <RegSparkline points={movement} color={headline.color} />
      ) : (
        <p className="mt-2 text-body-sm text-muted">Recent movement appears here as turns pass.</p>
      )}
    </div>
  );
}

/** Minimal inline SVG sparkline of recent Reg% values (ascending by turn). */
function RegSparkline({
  points,
  color,
}: {
  points: Array<{ turn: number; regPct: number }>;
  color: string;
}) {
  const w = 120;
  const h = 28;
  const values = points.map((p) => p.regPct);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.regPct - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="mt-2" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
