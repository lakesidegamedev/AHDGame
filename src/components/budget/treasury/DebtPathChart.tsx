"use client";

import {
  nominalGrowthFromReal,
  projectDebtPathHorizon,
} from "@/lib/budget/rules/sovereignDebtSustainability";
import { explainSovereignRate, type SovereignRateInputs } from "@/lib/budget/rules/sovereignRate";
import { debtCeilingBindingYear } from "@/lib/budget/rules/debtCeiling";

const YEARS = 5;
const VIEW_W = 100;
const VIEW_H = 34;
const PAD = 3;

interface DebtPathChartProps {
  /** The same debt-dynamics inputs the rate card and the rollover price. */
  inputs: SovereignRateInputs;
  countryId: string;
  /** Current debt stock, for the ceiling crossing. */
  debtPrincipal: number;
  /** GDP on the ratio's basis, current year. */
  gdp: number;
  storedCeiling: number;
  fiscalYear: number;
}

function flatNeedsLabel(stabilisingBalance: number): string {
  const pct = Math.abs(stabilisingBalance * 100).toFixed(1);
  if (Math.abs(stabilisingBalance) < 0.0005) {
    return "Holding the ratio flat needs a roughly balanced primary budget.";
  }
  return stabilisingBalance > 0
    ? `Holding it flat needs a primary surplus of ${pct}% of GDP.`
    : `Holding it flat is possible with a primary deficit of up to ${pct}% of GDP.`;
}

/**
 * Where the debt ratio goes if nothing changes: today's primary balance, rate
 * and nominal growth, run through the same identity the fiscal-year rollover
 * prices. The dashed line is today's ratio, so a path above it is a ratio
 * climbing and a path below is one coming down.
 */
export function DebtPathChart({
  inputs,
  countryId,
  debtPrincipal,
  gdp,
  storedCeiling,
  fiscalYear,
}: DebtPathChartProps) {
  const debtToGdp = inputs.debtToGdpRatio;
  const realGrowthPct = inputs.realGrowthPct ?? 0;
  // Same basis the rollover uses: the ladder rate before premiums. Pricing the
  // path off the stored effective rate made the shown stabilising balance differ
  // from the charged one.
  const breakdown = explainSovereignRate(inputs);
  const basisPct = breakdown.afterImfCapRate * 100;
  const path = breakdown.path;
  const points = projectDebtPathHorizon(
    {
      debtToGdp,
      primaryBalanceToGdp: inputs.primaryBalanceToGdp,
      nominalGrowthPct: nominalGrowthFromReal(realGrowthPct, inputs.inflationPct),
      interestRatePct: basisPct,
    },
    YEARS
  );
  const last = points[points.length - 1];
  const ceiling = debtCeilingBindingYear({
    points,
    gdp,
    debtPrincipal,
    storedCeiling,
    countryId,
    realGrowthPct,
  });
  const ceilingNote =
    ceiling.kind === "within"
      ? {
          text: `At this path the ceiling binds in FY${fiscalYear + ceiling.year} (${ceiling.year === 1 ? "next fiscal year" : `${ceiling.year} years out`}).`,
          warn: true,
        }
      : ceiling.kind === "already"
        ? { text: "The ceiling is already exceeded; borrowing is past the limit.", warn: true }
        : ceiling.kind === "beyond"
          ? { text: `The ceiling is not reached within ${YEARS} years on this path.`, warn: false }
          : null;

  const values = points.map((point) => point.debtToGdp * 100);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = Math.max(high - low, 1);
  const yMin = Math.max(0, low - spread * 0.15);
  const yMax = high + spread * 0.15;
  const x = (year: number) => PAD + (year / YEARS) * (VIEW_W - PAD * 2);
  const y = (ratio: number) =>
    VIEW_H - PAD - ((ratio * 100 - yMin) / (yMax - yMin)) * (VIEW_H - PAD * 2);
  const line = points
    .map((point) => `${x(point.year).toFixed(1)},${y(point.debtToGdp).toFixed(1)}`)
    .join(" ");
  const flatY = y(debtToGdp);

  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">Debt path</div>
        <div className="text-[11px] tabular-nums text-muted">
          {(debtToGdp * 100).toFixed(1)}% now → {(last.debtToGdp * 100).toFixed(1)}% in {YEARS}{" "}
          years
        </div>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="mt-2 h-20 w-full"
        role="img"
        aria-label={`Projected debt to GDP from ${(debtToGdp * 100).toFixed(1)} percent to ${(last.debtToGdp * 100).toFixed(1)} percent in ${YEARS} years`}
      >
        <line
          x1={PAD}
          x2={VIEW_W - PAD}
          y1={flatY}
          y2={flatY}
          stroke="currentColor"
          strokeWidth={0.35}
          strokeDasharray="2 2"
          className="text-muted"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={line}
          fill="none"
          stroke={
            path.trajectory === "rising"
              ? "var(--color-warning, #f59e0b)"
              : "var(--primary, #3b82f6)"
          }
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={x(last.year)}
          cy={y(last.debtToGdp)}
          r={1.2}
          fill="currentColor"
          className="text-foreground"
        />
      </svg>

      <div className="mt-1 flex items-baseline justify-between gap-3 text-[10px] text-muted">
        <span>today</span>
        <span>FY+{YEARS}</span>
        <span>
          {yMin.toFixed(0)}% to {yMax.toFixed(0)}%
        </span>
      </div>

      <p className="mt-2 text-body-sm text-foreground/85">
        {flatNeedsLabel(path.stabilisingPrimaryBalanceToGdp)}
      </p>
      {ceilingNote && (
        <p className={`mt-0.5 text-body-sm ${ceilingNote.warn ? "text-warning" : "text-muted"}`}>
          {ceilingNote.text}
        </p>
      )}
      <p className="mt-0.5 text-[11px] text-muted">
        Priced at the {basisPct.toFixed(2)}% ladder rate before premiums, the same basis the
        year-end rollover uses, with today&apos;s primary balance and nominal growth held constant.
      </p>
    </div>
  );
}
