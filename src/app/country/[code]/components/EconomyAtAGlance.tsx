"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGameEvents } from "@/hooks/useGameEvents";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { CountryEconomyOutlook } from "@/lib/economy/queries/countryEconomyOutlook";

interface HistoryPoint {
  turn: number;
  rate: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Where a value sits on a 0..1 track, for the bar and the target tick. */
function position(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) return 0;
  return clamp01((value - min) / (max - min));
}

function signedPercent(value: number, decimals = 1): string {
  const fixed = value.toFixed(decimals);
  return value > 0 ? `+${fixed}%` : `${fixed}%`;
}

/**
 * A small line for one series. Deliberately axis-free: the current figure and
 * its target sit next to the chart in words, and the line answers "which way
 * has this been going" in a strip this short.
 */
function Sparkline({ points, color }: { points: HistoryPoint[]; color: string }) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.rate).filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) * 0.02 || 1;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 28 - ((value - min) / span) * 24;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-8 w-full" aria-hidden>
      <polyline
        points={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

type Tone = "good" | "warn" | "bad" | "neutral";

const TONE_COLOR: Record<Tone, string> = {
  good: "var(--color-success, #22c55e)",
  warn: "var(--color-warning, #f59e0b)",
  bad: "var(--color-error, #ef4444)",
  neutral: "var(--color-muted, #94a3b8)",
};

function GlanceCard({
  label,
  value,
  caption,
  tone,
  fill,
  target,
  history,
}: {
  label: string;
  value: string;
  caption: string;
  tone: Tone;
  /** Fill position on the track, 0..1, or null for a value with no sensible span. */
  fill: number | null;
  /** Target marker position on the track, 0..1. */
  target: number | null;
  history: HistoryPoint[];
}) {
  const color = TONE_COLOR[tone];
  return (
    <div className="rounded-xl border border-card-border bg-card px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-sm text-muted">{label}</span>
        <span className="font-mono text-base font-bold tabular-nums text-foreground">{value}</span>
      </div>
      {fill !== null && (
        <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-card-muted">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.round(fill * 100)}%`, backgroundColor: color }}
          />
          {target !== null && (
            <span
              className="absolute top-0 h-full w-px bg-foreground/50"
              style={{ left: `${Math.round(target * 100)}%` }}
              aria-hidden
            />
          )}
        </div>
      )}
      <Sparkline points={history} color={color} />
      <p className="mt-1 text-[11px] leading-snug text-muted">{caption}</p>
    </div>
  );
}

/**
 * The country overview's economic readout: the six figures a player checks
 * before opening anything, each with its recent direction. It reads the same
 * economy payload as the economy page, so the two cannot disagree, and it adds
 * no turn work: every series here is already stored by the central bank.
 */
export function EconomyAtAGlance({ countryId }: { countryId: CountryId }) {
  const [state, setState] = useState<{
    status: "loading" | "error" | "ready";
    data: CountryEconomyOutlook | null;
  }>({ status: "loading", data: null });
  const [refreshKey, setRefreshKey] = useState(0);

  useGameEvents(() => setRefreshKey((key) => key + 1), ["turn_complete", "market_tick"]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/country/${countryId.toLowerCase()}/economy`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((payload: CountryEconomyOutlook) => {
        if (cancelled) return;
        setState({ status: "ready", data: payload });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "error", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [countryId, refreshKey]);

  const data = state.data?.countryId === countryId ? state.data : null;

  if (state.status === "error") {
    return (
      <section className="rounded-xl border border-card-border bg-card px-5 py-4 shadow-sm">
        <h2 className="text-sm font-bold text-foreground">Economy at a glance</h2>
        <p className="mt-2 text-body-sm text-muted">
          The economic figures did not load.{" "}
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="font-semibold text-primary hover:underline"
          >
            Try again
          </button>
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section aria-busy="true">
        <div className="h-48 animate-pulse rounded-xl bg-card-muted/60" aria-hidden />
      </section>
    );
  }

  const inflation = data.pulse.inflation;
  const inflationGap =
    inflation.value === null ? null : Math.abs(inflation.value - inflation.target);
  const inflationTone: Tone =
    inflationGap === null
      ? "neutral"
      : inflationGap <= 1
        ? "good"
        : inflationGap <= 3
          ? "warn"
          : "bad";

  const growth = data.pulse.gdpGrowth.value;
  const rate = data.pulse.primeRate;
  const rateGap = rate.value === null ? null : Math.abs(rate.value - rate.neutral);
  const rateTone: Tone =
    rateGap === null ? "neutral" : rateGap <= 1 ? "good" : rateGap <= 3 ? "warn" : "bad";

  const unemployment = data.realEconomy.unemployment.value;
  const unemploymentTone: Tone =
    unemployment === null
      ? "neutral"
      : unemployment < 6
        ? "good"
        : unemployment < 10
          ? "warn"
          : "bad";

  const deficitToGdp = data.markets.deficitToGdp;
  const debtToGdp = data.pulse.credit.debtToGdpRatio;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-heading-lg font-semibold tracking-tight text-foreground">
          Economy at a glance
        </h2>
        <Link
          href={`/country/${countryId.toLowerCase()}/economy`}
          className="text-body-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Full economic outlook
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <GlanceCard
          label="GDP growth"
          value={growth === null ? "No data" : signedPercent(growth)}
          caption="Central bank national growth, against a 0% line."
          tone={growth === null ? "neutral" : growth >= 0 ? "good" : "bad"}
          fill={growth === null ? null : position(growth, -5, 10)}
          target={position(0, -5, 10)}
          history={data.pulse.gdpGrowth.history}
        />
        <GlanceCard
          label="Inflation"
          value={inflation.value === null ? "No data" : `${inflation.value.toFixed(1)}%`}
          caption={`Target ${inflation.target.toFixed(1)}%. The tick marks the target.`}
          tone={inflationTone}
          fill={inflation.value === null ? null : position(inflation.value, 0, 20)}
          target={position(inflation.target, 0, 20)}
          history={inflation.history}
        />
        <GlanceCard
          label="Policy rate"
          value={rate.value === null ? "No data" : `${rate.value.toFixed(2)}%`}
          caption={
            rate.heldTurns === null
              ? `Neutral rate ${rate.neutral.toFixed(2)}%.`
              : `Neutral rate ${rate.neutral.toFixed(2)}%, held ${rate.heldTurns} turn${rate.heldTurns === 1 ? "" : "s"}.`
          }
          tone={rateTone}
          fill={rate.value === null ? null : position(rate.value, 0, 20)}
          target={position(rate.neutral, 0, 20)}
          history={rate.history}
        />
        <GlanceCard
          label="Unemployment"
          value={unemployment === null ? "No data" : `${unemployment.toFixed(1)}%`}
          caption={
            data.realEconomy.unemployment.trend === null
              ? "State-weighted national average."
              : `State-weighted national average, trend ${signedPercent(data.realEconomy.unemployment.trend, 2)}.`
          }
          tone={unemploymentTone}
          fill={unemployment === null ? null : position(unemployment, 0, 20)}
          target={null}
          history={[]}
        />
        <GlanceCard
          label="Budget balance"
          value={
            deficitToGdp === null
              ? "No data"
              : `${deficitToGdp > 0 ? "-" : ""}${Math.abs(deficitToGdp).toFixed(1)}% of GDP`
          }
          caption="Live surplus or deficit, as a share of GDP."
          tone={
            deficitToGdp === null
              ? "neutral"
              : deficitToGdp > 3
                ? "bad"
                : deficitToGdp > 0
                  ? "warn"
                  : "good"
          }
          fill={deficitToGdp === null ? null : position(deficitToGdp, -5, 15)}
          target={position(0, -5, 15)}
          history={[]}
        />
        <GlanceCard
          label="Debt to GDP"
          value={debtToGdp === null ? "No data" : `${debtToGdp.toFixed(0)}%`}
          caption={
            data.pulse.credit.rating
              ? `Sovereign credit ${data.pulse.credit.rating}.`
              : "Outstanding sovereign debt as a share of GDP."
          }
          tone={
            debtToGdp === null
              ? "neutral"
              : debtToGdp < 60
                ? "good"
                : debtToGdp < 100
                  ? "warn"
                  : "bad"
          }
          fill={debtToGdp === null ? null : position(debtToGdp, 0, 200)}
          target={null}
          history={[]}
        />
      </div>
    </section>
  );
}

export default EconomyAtAGlance;
