"use client";

import Link from "next/link";
import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { formatGDP, formatCurrencyCompactChip } from "@/lib/utils/formatters";
import { getCurrencyPrefix } from "@/lib/utils/budgetCalculations";
import { budgetUrl } from "@/lib/urls";
import { Sparkline } from "@/components/metrics/Sparkline";

interface HistoryPoint {
  turn: number;
  rate: number;
}

export interface PulseData {
  gdpMillions: number;
  gdpPerCapita: number;
  gdpGrowth: { value: number | null; history: HistoryPoint[] };
  inflation: { value: number | null; target: number; history: HistoryPoint[] };
  primeRate: {
    value: number | null;
    heldTurns: number | null;
    neutral: number;
    history: HistoryPoint[];
  };
  credit: {
    rating: string | null;
    debtToGdpRatio: number | null;
    /** Optional so older payloads and fixtures still type-check. */
    debtTrajectory?: "falling" | "stable" | "rising" | null;
    primaryBalancePct?: number | null;
    /** GDP the ratios divide by (smoothed budget GDP), in millions. */
    ratioGdpMillions?: number | null;
    stabilisingPrimaryBalancePct?: number | null;
    /** Ladder rate the flat-balance figure is priced at, in percent. */
    debtPathBasisPct?: number | null;
  };
}

interface PulseStripProps {
  countryId: CountryId | string;
  pulse: PulseData;
}

function signed(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

function primaryBalanceLabel(value: number): string {
  const magnitude = Math.abs(value).toFixed(1);
  if (magnitude === "0.0") return "a balanced primary budget";
  return `a primary ${value < 0 ? "deficit" : "surplus"} of ${magnitude}% of budget GDP`;
}

/** Direction glyph from the last two history points; null when flat/unknown. */
function historyDirection(history: HistoryPoint[]): "up" | "down" | null {
  if (history.length < 2) return null;
  const last = history[history.length - 1].rate;
  const prev = history[history.length - 2].rate;
  if (last > prev) return "up";
  if (last < prev) return "down";
  return null;
}

function Cell({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 px-4 py-3.5 ${className}`}>
      <span className="whitespace-nowrap text-body-sm font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * The five-cell pulse strip — GDP, GDP growth (central-bank hero figure),
 * inflation vs target, prime rate, credit standing — with the existing-history
 * sparklines. Direction is never color-only: polarity-aware success/error
 * always pairs with ▲▼ glyphs. Lives inside the EconomyMasthead, in the same
 * position as Budget's fiscal stat strip and Metrics' headline tiles.
 */
export function PulseStrip({ countryId, pulse }: PulseStripProps) {
  const config = COUNTRY_CLIENT_CONFIGS[(countryId as string).toUpperCase() as CountryId];
  const prefix = getCurrencyPrefix(countryId as CountryId);
  const regionWord = (config?.regionLabel ?? "State").toLowerCase();

  const growth = pulse.gdpGrowth.value;
  const inflation = pulse.inflation.value;
  const inflationDir = historyDirection(pulse.inflation.history);
  // Polarity: inflation reads healthy within ±1pp of target, bad outside it.
  const inflationGood = inflation != null && Math.abs(inflation - pulse.inflation.target) <= 1;
  const prime = pulse.primeRate.value;
  const primeDir = historyDirection(pulse.primeRate.history);
  const credit = pulse.credit;
  const primaryBalance = credit.primaryBalancePct;
  const stabilisingBalance = credit.stabilisingPrimaryBalancePct;
  const debtNote =
    credit.debtTrajectory === "rising"
      ? "Debt-to-GDP is projected to rise."
      : credit.debtTrajectory === "falling"
        ? "Debt-to-GDP is projected to fall."
        : credit.debtTrajectory === "stable"
          ? "Debt-to-GDP is projected to hold steady."
          : null;

  return (
    <div className="grid grid-cols-2 divide-x divide-card-border bg-card-muted/60 lg:grid-cols-5">
      <Cell label="Gross domestic product" className="col-span-2 lg:col-span-1">
        <span className="font-mono text-heading font-bold leading-tight tabular-nums text-foreground">
          {pulse.gdpMillions > 0 ? formatGDP(pulse.gdpMillions, prefix) : "—"}
        </span>
        <span className="text-body-sm text-muted">
          per capita{" "}
          <span className="font-mono font-semibold text-foreground">
            {pulse.gdpPerCapita > 0 ? formatCurrencyCompactChip(pulse.gdpPerCapita, prefix) : "—"}
          </span>{" "}
          · {regionWord}-aggregated
        </span>
      </Cell>

      <Cell label="GDP growth">
        <span
          className={`font-mono text-heading font-bold leading-tight tabular-nums ${
            growth == null ? "text-muted" : growth >= 0 ? "text-success" : "text-error"
          }`}
        >
          {growth != null ? (
            <>
              {signed(growth)}% {growth >= 0 ? "▲" : "▼"}
            </>
          ) : (
            "—"
          )}
        </span>
        <span className="text-body-sm text-muted">central bank · /yr</span>
        {pulse.gdpGrowth.history.length > 1 && (
          <Sparkline data={pulse.gdpGrowth.history.map((p) => p.rate)} w={116} h={26} />
        )}
      </Cell>

      <Cell label="Inflation">
        <span
          className={`font-mono text-heading font-bold leading-tight tabular-nums ${
            inflation == null ? "text-muted" : inflationGood ? "text-success" : "text-error"
          }`}
        >
          {inflation != null ? (
            <>
              {inflation.toFixed(1)}%{inflationDir && ` ${inflationDir === "up" ? "▲" : "▼"}`}
            </>
          ) : (
            "—"
          )}
        </span>
        <span className="text-body-sm text-muted">target {pulse.inflation.target.toFixed(1)}%</span>
        {pulse.inflation.history.length > 1 && (
          <Sparkline data={pulse.inflation.history.map((p) => p.rate)} w={116} h={26} />
        )}
      </Cell>

      <Cell label="Prime rate">
        <span className="font-mono text-heading font-bold leading-tight tabular-nums text-foreground">
          {prime != null ? (
            <>
              {prime.toFixed(2)}%{" "}
              <span className="text-body-sm font-bold text-muted">
                {primeDir ? (primeDir === "up" ? "▲" : "▼") : "──"}
              </span>
            </>
          ) : (
            "—"
          )}
        </span>
        <span className="text-body-sm text-muted">
          neutral ≈ {pulse.primeRate.neutral.toFixed(0)}%
          {pulse.primeRate.heldTurns != null && <> · held {pulse.primeRate.heldTurns}t</>}
        </span>
        {pulse.primeRate.history.length > 1 && (
          <Sparkline data={pulse.primeRate.history.map((p) => p.rate)} w={116} h={26} />
        )}
      </Cell>

      <Cell label="Credit standing">
        <span className="font-mono text-heading font-bold leading-tight">
          <span style={{ color: "var(--stat, var(--primary))" }}>{pulse.credit.rating ?? "—"}</span>{" "}
          {pulse.credit.debtToGdpRatio != null && (
            <span className="text-body-sm font-bold text-muted">
              {(pulse.credit.debtToGdpRatio * 100).toFixed(1)}% debt-to-GDP
            </span>
          )}
          {pulse.credit.debtToGdpRatio != null &&
            pulse.credit.ratioGdpMillions != null &&
            pulse.credit.ratioGdpMillions > 0 && (
              <span className="block text-body-sm font-normal text-muted">
                on budget GDP {formatGDP(pulse.credit.ratioGdpMillions, prefix)}, a smoothed figure
                that can differ from the GDP shown first
              </span>
            )}
        </span>
        {primaryBalance != null && (
          <span className="text-body-sm text-muted">
            Current budget shows {primaryBalanceLabel(primaryBalance)}.
          </span>
        )}
        {debtNote && (
          <span
            title={
              credit.debtPathBasisPct != null
                ? `Priced at the ${credit.debtPathBasisPct.toFixed(2)}% ladder rate the year-end rollover uses, before premiums`
                : undefined
            }
            className={`text-body-sm ${
              credit.debtTrajectory === "rising" ? "text-warning" : "text-muted"
            }`}
          >
            {debtNote}
            {credit.debtTrajectory === "rising" && stabilisingBalance != null && (
              <> It would hold steady at {primaryBalanceLabel(stabilisingBalance)}.</>
            )}
          </span>
        )}
        <Link
          href={budgetUrl(countryId)}
          className="mt-auto text-body-sm font-semibold text-primary hover:underline"
        >
          National Budget &rarr;
        </Link>
      </Cell>
    </div>
  );
}

export default PulseStrip;
