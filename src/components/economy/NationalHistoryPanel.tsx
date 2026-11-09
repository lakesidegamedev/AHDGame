"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useGameEvents } from "@/hooks/useGameEvents";
import { getCurrencyPrefix } from "@/lib/utils/budgetCalculations";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { NationalMacroPoint } from "@/lib/economy/rules/macroHistory";
import { seriesChangePercent } from "@/lib/economy/rules/macroHistory";

export interface CountryMacroHistoryPayload {
  countryId: string;
  currencyCode: string;
  currentTurn: number;
  turns: number;
  points: NationalMacroPoint[];
}

type MetricId = "population" | "gdp" | "gdpPerCapita";

const METRIC_ORDER: readonly MetricId[] = ["population", "gdp", "gdpPerCapita"];

/** Series colour per metric; every label comes from the `economyHistory` catalog. */
const METRIC_COLOR: Record<MetricId, string> = {
  population: "var(--color-secondary, #06b6d4)",
  gdp: "var(--color-success, #22c55e)",
  gdpPerCapita: "var(--color-primary, #ef4444)",
};

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 56;
const PAD_RIGHT = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 30;
/** Sparkline geometry for the compact form on a country overview page. */
const COMPACT_HEIGHT = 96;
const COMPACT_PAD = 2;

function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function metricValue(point: NationalMacroPoint, metric: MetricId): number | null {
  if (metric === "population") return point.population;
  if (metric === "gdp") return point.gdpMillions * 1_000_000;
  return point.gdpPerCapita;
}

function formatMetricValue(
  value: number,
  metric: MetricId,
  prefix: string,
  peopleUnit: string
): string {
  if (metric === "population") return `${compactNumber(value)} ${peopleUnit}`;
  return `${prefix}${compactNumber(value)}`;
}

function signedPercent(value: number): string {
  const fixed = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  return value > 0 ? `+${fixed}%` : `${fixed}%`;
}

/**
 * National history panel: population, GDP and GDP per capita for every country,
 * playable or economy-only, read from the durable per-turn macro series.
 *
 * The series covers every recorded turn, so a thin window is a real coverage
 * fact rather than a bug; the empty state says so instead of drawing a flat
 * zero line. `compact` drops the axis labels and the blurb for the overview
 * page, where the chart is a sparkline rather than the destination.
 */
export function NationalHistoryPanel({
  countryId,
  compact = false,
}: {
  countryId: CountryId;
  compact?: boolean;
}) {
  const t = useTranslations("economyHistory");
  const [metric, setMetric] = useState<MetricId>("gdp");
  const [hovered, setHovered] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // The turn this page last saw complete. Sending it keeps the refetch out of
  // the cache entry a client filled before that turn finished, and every client
  // that saw the same turn asks for the same URL, so the edge still shares one
  // body per turn rather than one per client.
  const [untilTurn, setUntilTurn] = useState<number | null>(null);
  const [state, setState] = useState<{
    status: "loading" | "error" | "ready";
    data: CountryMacroHistoryPayload | null;
  }>({ status: "loading", data: null });

  useGameEvents(
    (event) => {
      const turn = event.payload.turn;
      if (typeof turn === "number" && Number.isFinite(turn)) setUntilTurn(turn);
      setRefreshKey((key) => key + 1);
    },
    ["turn_complete"]
  );

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ turns: "120" });
    if (untilTurn !== null) query.set("until", String(untilTurn));
    // A refetch keeps the previous series on screen instead of flashing a
    // skeleton; country changes are detected from the payload itself.
    fetch(`/api/country/${countryId.toLowerCase()}/economy/history?${query.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((payload: CountryMacroHistoryPayload) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", data: payload });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "error", data: null });
      });
    return () => controller.abort();
  }, [countryId, refreshKey, untilTurn]);

  const prefix = getCurrencyPrefix(countryId);
  const color = METRIC_COLOR[metric];
  // A payload for another country is treated as absent: a refetch for a country
  // the panel has already left must not leak its numbers under the new prefix.
  const data = state.data?.countryId === countryId.toUpperCase() ? state.data : null;
  const loading = state.status === "loading" || (state.status === "ready" && data === null);

  const plotted = useMemo(() => {
    const points = data?.points ?? [];
    return points
      .map((point) => ({ point, value: metricValue(point, metric) }))
      .filter((entry): entry is { point: NationalMacroPoint; value: number } => {
        return entry.value !== null && Number.isFinite(entry.value);
      });
  }, [data, metric]);

  const change = seriesChangePercent(plotted.map((entry) => entry.value));
  const latest = plotted.at(-1) ?? null;

  return (
    <section
      className={`rounded-xl border border-card-border bg-card shadow-sm ${
        compact ? "px-4 py-3" : "px-5 py-4"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">
            {t("title")} <span className="font-normal text-muted">· {t("recorded")}</span>
          </h3>
          {!compact && (
            <p className="mt-0.5 text-[11px] text-muted">
              {t("blurb", { currency: data?.currencyCode ?? t("unit.localCurrency") })}
            </p>
          )}
        </div>
        {latest && (
          <div className="flex items-baseline gap-2">
            <span
              className={`font-mono font-bold tabular-nums text-foreground ${
                compact ? "text-base" : "text-lg"
              }`}
            >
              {formatMetricValue(latest.value, metric, prefix, t("unit.people"))}
            </span>
            {change !== null && (
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  change >= 0 ? "text-success" : "text-error"
                }`}
              >
                {t("change", { change: signedPercent(change) })}
              </span>
            )}
          </div>
        )}
      </div>

      <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "mt-2" : "mt-3"}`}>
        {METRIC_ORDER.map((id) => {
          const entryColor = METRIC_COLOR[id];
          const active = id === metric;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setMetric(id)}
              aria-pressed={active}
              className={`rounded-md border font-medium transition-colors ${
                compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
              } ${
                active
                  ? "border-card-border bg-card-elevated text-foreground shadow-card"
                  : "border-transparent text-muted hover:bg-card-muted hover:text-foreground"
              }`}
            >
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: active ? entryColor : "transparent",
                  border: `1.5px solid ${entryColor}`,
                }}
              />
              {t(`metric.${id}`)}
            </button>
          );
        })}
        {!compact && (
          <span className="ml-auto text-[10px] text-muted">
            {metric === "population" ? t("unit.people") : t("unit.localCurrency")}
          </span>
        )}
      </div>

      {state.status === "error" ? (
        <div
          className={`rounded-lg border border-card-border bg-card-muted/40 text-center text-muted ${
            compact ? "mt-3 px-4 py-4 text-xs" : "mt-4 px-4 py-6 text-sm"
          }`}
        >
          {t("error")}
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="ml-2 font-semibold text-primary hover:underline"
          >
            {t("retry")}
          </button>
        </div>
      ) : loading ? (
        <div
          className={`animate-pulse rounded-lg bg-card-muted/60 ${
            compact ? "mt-3 h-24" : "mt-4 h-48"
          }`}
        />
      ) : plotted.length < 2 ? (
        <div
          className={`flex items-center justify-center rounded-lg border border-dashed border-card-border text-center text-muted ${
            compact ? "mt-3 h-24 px-4 text-xs" : "mt-4 h-40 px-6 text-sm"
          }`}
        >
          {t("empty")}
        </div>
      ) : (
        <MacroChart
          entries={plotted}
          metric={metric}
          color={color}
          prefix={prefix}
          peopleUnit={t("unit.people")}
          hovered={hovered}
          onHover={setHovered}
          compact={compact}
        />
      )}
    </section>
  );
}

function MacroChart({
  entries,
  metric,
  color,
  prefix,
  peopleUnit,
  hovered,
  onHover,
  compact,
}: {
  entries: Array<{ point: NationalMacroPoint; value: number }>;
  metric: MetricId;
  color: string;
  prefix: string;
  peopleUnit: string;
  hovered: number | null;
  onHover: (index: number | null) => void;
  compact: boolean;
}) {
  const t = useTranslations("economyHistory");
  const height = compact ? COMPACT_HEIGHT : HEIGHT;
  const padLeft = compact ? COMPACT_PAD : PAD_LEFT;
  const padRight = compact ? COMPACT_PAD : PAD_RIGHT;
  const padTop = compact ? COMPACT_PAD : PAD_TOP;
  const padBottom = compact ? COMPACT_PAD : PAD_BOTTOM;
  const innerW = WIDTH - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const values = entries.map((entry) => entry.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) * 0.02 || 1;
  const low = min - span * 0.08;
  const high = max + span * 0.08;
  const range = high - low || 1;

  const toX = (index: number): number =>
    padLeft + (index / Math.max(1, entries.length - 1)) * innerW;
  const toY = (value: number): number => padTop + ((high - value) / range) * innerH;

  const polyline = entries
    .map((entry, index) => `${toX(index).toFixed(1)},${toY(entry.value).toFixed(1)}`)
    .join(" ");

  const yLabels = Array.from({ length: 4 }, (_, index) => low + (range * index) / 3);
  const xIndices = [0, Math.floor((entries.length - 1) / 2), entries.length - 1];
  const hoveredEntry = hovered !== null ? (entries[hovered] ?? null) : null;
  const gradientId = `macro-history-${metric}${compact ? "-compact" : ""}`;

  return (
    <div className={`relative select-none ${compact ? "mt-1" : "mt-2"}`}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={t("chartLabel", { metric: t(`metric.${metric}`), turns: entries.length })}
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {!compact &&
          yLabels.map((value, index) => {
            const y = toY(value);
            return (
              <g key={index}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={WIDTH - padRight}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-card-border/50"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize={10}
                  className="fill-muted"
                >
                  {compactNumber(value)}
                </text>
              </g>
            );
          })}

        <polygon
          points={`${toX(0)},${padTop + innerH} ${polyline} ${toX(entries.length - 1)},${padTop + innerH}`}
          fill={`url(#${gradientId})`}
        />
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {entries.map((entry, index) => {
          const prevX = index > 0 ? toX(index - 1) : toX(index);
          const nextX = index < entries.length - 1 ? toX(index + 1) : toX(index);
          const left = (prevX + toX(index)) / 2;
          const width = Math.max(6, (nextX + toX(index)) / 2 - left);
          return (
            <rect
              key={entry.point.turn}
              x={left}
              y={padTop}
              width={width}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => onHover(index)}
            />
          );
        })}

        {hoveredEntry && hovered !== null && (
          <>
            <line
              x1={toX(hovered)}
              y1={padTop}
              x2={toX(hovered)}
              y2={padTop + innerH}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="3 2"
              opacity={0.7}
            />
            <circle cx={toX(hovered)} cy={toY(hoveredEntry.value)} r={4} fill={color} />
          </>
        )}

        {!compact &&
          xIndices.map((index, position) => {
            const entry = entries[index];
            if (!entry) return null;
            return (
              <text
                key={`${index}-${position}`}
                x={toX(index)}
                y={height - 8}
                textAnchor={position === 0 ? "start" : position === 2 ? "end" : "middle"}
                fontSize={10}
                className="fill-muted"
              >
                {t("turnAxis", { turn: entry.point.turn })}
              </text>
            );
          })}
      </svg>

      {hoveredEntry && (
        <div className="pointer-events-none absolute right-2 top-1 rounded-md border border-card-border bg-card px-2.5 py-1.5 text-xs shadow-card">
          <span className="text-muted">
            {t("turn", { turn: hoveredEntry.point.turn })}
            {hoveredEntry.point.year !== null ? ` · ${hoveredEntry.point.year}` : ""} ·{" "}
          </span>
          <span className="font-semibold tabular-nums" style={{ color }}>
            {formatMetricValue(hoveredEntry.value, metric, prefix, peopleUnit)}
          </span>
        </div>
      )}
    </div>
  );
}

export default NationalHistoryPanel;
