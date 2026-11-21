"use client";

import { useEffect, useMemo, useState } from "react";
import type { MetricCategoryId } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countriesCore";
import {
  CATEGORY_LABELS,
  formatMetricValue,
  getMetricDefinition,
} from "@/lib/constants/metricDefinitions";
import {
  compareAcrossMetrics,
  rankNations,
  type CompareRow,
  type RankedNation,
} from "@/lib/world/rankings";
import { comparePairReady, compareShareParam } from "@/lib/world/countryCompare";
import { buildCompareSummary, type CompareSummarySide } from "@/lib/world/compareSummary";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import { useWorldMetricFilter, type WorldMetricsCountry } from "../WorldMetricFilterContext";
import type { CountryEconomyOutlook } from "@/lib/economy/queries/countryEconomyOutlook";
import { fetchJson } from "@/lib/observability/fetchJson";
import { buildCompareSeries } from "@/lib/world/compareSeries";
import type { DebtTrajectory } from "@/lib/budget/rules/sovereignDebtSustainability";

const SLOT_COUNT = 2;

/** Which copy button was pressed last, so each one can name its own result. */
type CopyState = "idle" | "link" | "summary" | "link-failed" | "summary-failed";

/**
 * Side-by-side reading of two nations picked on the globe.
 *
 * Every figure is ranked against the whole world, not against the other side, so
 * "#4" means fourth in the world here just as it does in the map tooltip. The
 * stronger side of a row is marked from `score` rather than the raw measure,
 * because the score is what knows a low unemployment rate is the good one.
 */
export default function CountryComparePanel({ fullscreen = false }: { fullscreen?: boolean }) {
  const {
    compareMode,
    setCompareMode,
    compareCountryIds,
    compareCategory,
    setCompareCategory,
    toggleCompareCountry,
    clearCompare,
    worldMetrics,
  } = useWorldMetricFilter();
  const countryName = useCountryDisplayName();

  const [copyState, setCopyState] = useState<CopyState>("idle");

  // Built at click time from the live address, so the link carries the current
  // origin and any other world parameters already in the URL.
  const compareUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("compare", compareShareParam(compareCountryIds));
    return url.toString();
  };

  const copy = async (text: string, kind: "link" | "summary") => {
    if (!navigator.clipboard) {
      setCopyState(kind === "link" ? "link-failed" : "summary-failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyState(kind);
    } catch {
      setCopyState(kind === "link" ? "link-failed" : "summary-failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2200);
  };

  // Recent paths come from the same economy payload the economy page reads, one
  // fetch per pick. Two nations only, and the effect is keyed on the pair so a
  // changed side refetches instead of showing the previous nation's line.
  const [outlooks, setOutlooks] = useState<Record<string, CountryEconomyOutlook | null>>({});
  const pairKey = compareCountryIds.slice(0, SLOT_COUNT).join(",");
  useEffect(() => {
    const ids = pairKey ? pairKey.split(",") : [];
    if (ids.length < SLOT_COUNT) {
      setOutlooks({});
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    Promise.allSettled(
      ids.map((id) =>
        fetchJson<CountryEconomyOutlook>(`/api/country/${id.toLowerCase()}/economy`, {
          feature: "world-compare-economy",
          signal: controller.signal,
        })
      )
    ).then((results) => {
      if (cancelled) return;
      // A nation without a stored economy document is a normal empty side, and
      // settled results keep the other side's series when one fetch fails.
      setOutlooks(
        Object.fromEntries(
          ids.map((id, index) => [
            id,
            results[index]?.status === "fulfilled" ? results[index].value : null,
          ])
        )
      );
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pairKey]);

  // Recent paths come from the same economy payload the economy page reads, one
  // fetch per pick. Two nations only, and the effect is keyed on the pair so a
  // changed side refetches instead of showing the previous nation's line.
  const [outlooks, setOutlooks] = useState<Record<string, CountryEconomyOutlook | null>>({});
  const pairKey = compareCountryIds.slice(0, SLOT_COUNT).join(",");
  useEffect(() => {
    const ids = pairKey ? pairKey.split(",") : [];
    if (ids.length < SLOT_COUNT) {
      setOutlooks({});
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    Promise.allSettled(
      ids.map((id) =>
        fetchJson<CountryEconomyOutlook>(`/api/country/${id.toLowerCase()}/economy`, {
          feature: "world-compare-economy",
          signal: controller.signal,
        })
      )
    ).then((results) => {
      if (cancelled) return;
      // A nation without a stored economy document is a normal empty side, and
      // settled results keep the other side's series when one fetch fails.
      setOutlooks(
        Object.fromEntries(
          ids.map((id, index) => [
            id,
            results[index]?.status === "fulfilled" ? results[index].value : null,
          ])
        )
      );
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pairKey]);

  // Every national document, keyed by country id. The ISO-keyed map is a subset
  // and only fills gaps in the by-id payload.
  const byId = useMemo(() => {
    const map = new Map<string, WorldMetricsCountry>();
    if (!worldMetrics) return map;
    for (const country of Object.values(worldMetrics.countriesById ?? {})) {
      map.set(country.countryId, country);
    }
    for (const country of Object.values(worldMetrics.countries)) {
      if (!map.has(country.countryId)) map.set(country.countryId, country);
    }
    return map;
  }, [worldMetrics]);

  if (!compareMode) return null;

  const categories = worldMetrics?.availableCategories ?? [];
  const category = categories.includes(compareCategory) ? compareCategory : categories[0];

  const sides = Array.from({ length: SLOT_COUNT }, (_, index) => {
    const id = compareCountryIds[index] ?? null;
    return {
      id,
      label: id ? countryName(id) : null,
      country: id ? (byId.get(id) ?? null) : null,
    };
  });

  const all = [...byId.values()];
  const picked = compareCountryIds.filter((id) => byId.has(id));
  const overallRanks = new Map<string, RankedNation>(
    rankNations(all, { kind: "overall" }).map((row): [string, RankedNation] => [row.countryId, row])
  );
  const categoryRanks = new Map<string, RankedNation>(
    category
      ? rankNations(all, { kind: "category", category }).map((row): [string, RankedNation] => [
          row.countryId,
          row,
        ])
      : []
  );

  const metricIds = category
    ? [
        ...new Set([
          ...(worldMetrics?.availableMetrics[category] ?? []),
          ...picked.flatMap((id) => Object.keys(byId.get(id)?.categories[category] ?? {})),
        ]),
      ]
    : [];
  const rows = category
    ? compareAcrossMetrics({ countries: all, countryIds: picked, category, metrics: metricIds })
    : [];

  // Charts only when both sides loaded with history; one missing side would
  // silently show a single line and invite a comparison that is not there.
  const chartPair =
    compareCountryIds.length === SLOT_COUNT && compareCountryIds.every((id) => outlooks[id])
      ? ([outlooks[compareCountryIds[0]], outlooks[compareCountryIds[1]]] as [
          CountryEconomyOutlook,
          CountryEconomyOutlook,
        ])
      : null;

  // Debt shows per side as soon as that side's payload arrives, so one missed
  // economy document does not hide the other nation's figures.
  const debtSides = sides.map((side) => (side.id ? (outlooks[side.id]?.debt ?? null) : null));
  const showDebt = debtSides.some((debt) => debt !== null);

  const cellFor = (row: CompareRow, id: CountryId | null) =>
    id ? (row.cells.find((cell) => cell.countryId === id) ?? null) : null;

  // The summary reads the same rows the panel shows, so a pasted comparison
  // cannot drift from what the sender sees. Both sides need stored figures
  // before there is anything worth pasting beside the link.
  const summarySides: [CompareSummarySide, CompareSummarySide] = [
    {
      name: sides[0].label ?? "Not picked",
      overall: sides[0].id ? (overallRanks.get(sides[0].id) ?? null) : null,
      categoryRank: sides[0].id ? (categoryRanks.get(sides[0].id) ?? null) : null,
    },
    {
      name: sides[1].label ?? "Not picked",
      overall: sides[1].id ? (overallRanks.get(sides[1].id) ?? null) : null,
      categoryRank: sides[1].id ? (categoryRanks.get(sides[1].id) ?? null) : null,
    },
  ];
  const summaryReady = comparePairReady(compareCountryIds) && sides.every((side) => side.country);
  const copySummary = () => {
    void copy(
      buildCompareSummary({
        sides: summarySides,
        category: category ?? null,
        rows: rows.map((row) => ({
          metric: row.metric,
          cells: [cellFor(row, sides[0].id), cellFor(row, sides[1].id)] as const,
        })),
        url: compareUrl(),
      }),
      "summary"
    );
  };

  const shellClass = fullscreen
    ? "fixed left-4 top-16 z-[70] max-h-[70vh] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-card-border bg-card/95 p-4 shadow-panel"
    : "relative z-10 mt-3 rounded-xl border border-card-border bg-card p-4 shadow-sm";

  return (
    <section className={shellClass} aria-label="Country comparison">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-body font-semibold">Compare nations</h2>
          <p className="mt-0.5 text-body-sm text-muted">
            Click a nation on the map to pick a side. Every figure carries its world rank.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {comparePairReady(compareCountryIds) && (
            <button
              type="button"
              onClick={() => void copy(compareUrl(), "link")}
              aria-live="polite"
              className="rounded-md border border-card-border px-2.5 py-1 text-body-sm text-muted transition-colors hover:bg-card-elevated hover:text-foreground"
            >
              {copyState === "link"
                ? "Link copied"
                : copyState === "link-failed"
                  ? "Copy failed"
                  : "Copy link"}
            </button>
          )}
          {summaryReady && (
            <button
              type="button"
              onClick={copySummary}
              aria-live="polite"
              className="rounded-md border border-card-border px-2.5 py-1 text-body-sm text-muted transition-colors hover:bg-card-elevated hover:text-foreground"
            >
              {copyState === "summary"
                ? "Summary copied"
                : copyState === "summary-failed"
                  ? "Copy failed"
                  : "Copy summary"}
            </button>
          )}
          {compareCountryIds.length > 0 && (
            <button
              type="button"
              onClick={clearCompare}
              className="rounded-md border border-card-border px-2.5 py-1 text-body-sm text-muted transition-colors hover:bg-card-elevated hover:text-foreground"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setCompareMode(false)}
            className="rounded-md border border-card-border px-2.5 py-1 text-body-sm text-muted transition-colors hover:bg-card-elevated hover:text-foreground"
          >
            Done
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {sides.map((side, index) => (
          <div
            key={index}
            className="min-w-0 rounded-lg border border-card-border bg-card-elevated px-3 py-2"
          >
            {side.id ? (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold">{side.label}</p>
                  <p className="text-body-sm text-muted">
                    {side.country?.overallScore !== null && side.country?.overallScore !== undefined
                      ? `Overall score ${side.country.overallScore}`
                      : "No stored figures"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (side.id) toggleCompareCountry(side.id);
                  }}
                  aria-label={`Remove ${side.label} from the comparison`}
                  className="shrink-0 rounded px-1 text-muted transition-colors hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            ) : (
              <p className="text-body-sm text-muted">Pick a nation on the map</p>
            )}
          </div>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {categories.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setCompareCategory(entry)}
              className={`rounded-md px-2 py-0.5 text-body-sm font-medium transition-colors ${
                entry === category
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "border border-transparent text-muted hover:bg-card-elevated hover:text-foreground"
              }`}
            >
              {CATEGORY_LABELS[entry]}
            </button>
          ))}
        </div>
      )}

      {picked.length === 0 ? (
        <p className="mt-3 text-body-sm text-muted">
          Nothing picked yet. Turn on the compare button, then click two nations.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[22rem]">
            <div className="grid grid-cols-[minmax(7rem,1.5fr)_1fr_1fr] items-center gap-x-2 border-b border-card-border pb-1.5 text-body-sm text-muted">
              <span>Figure</span>
              {sides.map((side, index) => (
                <span key={index} className="truncate text-right">
                  {side.label ?? "Not picked"}
                </span>
              ))}
            </div>

            <ScoreRow
              label="Overall score"
              cells={sides.map((side) => (side.id ? (overallRanks.get(side.id) ?? null) : null))}
            />
            {category && (
              <ScoreRow
                label={`${CATEGORY_LABELS[category]} average`}
                cells={sides.map((side) => (side.id ? (categoryRanks.get(side.id) ?? null) : null))}
              />
            )}

            {rows.map((row) => (
              <MetricRow
                key={row.metric}
                row={row}
                category={category}
                cells={sides.map((side) => cellFor(row, side.id))}
              />
            ))}
          </div>
        </div>
      )}
      {chartPair && (
        <div className="mt-4">
          <h3 className="text-body-sm font-semibold">Recent path</h3>
          <p className="mt-0.5 text-[11px] text-muted">
            Both nations on one scale per series, positioned by turn.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <SeriesChart
              title="GDP growth"
              seriesA={chartPair[0].pulse.gdpGrowth.history}
              seriesB={chartPair[1].pulse.gdpGrowth.history}
              labels={[sides[0].label ?? "A", sides[1].label ?? "B"]}
            />
            <SeriesChart
              title="Inflation"
              seriesA={chartPair[0].pulse.inflation.history}
              seriesB={chartPair[1].pulse.inflation.history}
              labels={[sides[0].label ?? "A", sides[1].label ?? "B"]}
            />
            <SeriesChart
              title="Policy rate"
              seriesA={chartPair[0].pulse.primeRate.history}
              seriesB={chartPair[1].pulse.primeRate.history}
              labels={[sides[0].label ?? "A", sides[1].label ?? "B"]}
            />
          </div>
        </div>
      )}
      {showDebt && (
        <div className="mt-4">
          <h3 className="text-body-sm font-semibold">Debt</h3>
          <p className="mt-0.5 text-[11px] text-muted">
            Rate today, the ratio in five years at today&apos;s primary balance, and the balance
            that would hold it flat.
          </p>
          <div className="mt-1">
            <DebtRow
              label="Effective rate"
              cells={debtSides.map((debt) =>
                debt ? `${debt.effectiveRatePct.toFixed(1)}%` : "n/a"
              )}
            />
            <DebtRow
              label="In five years"
              cells={debtSides.map((debt) =>
                debt ? `${debt.projectedDebtToGdpPct.toFixed(1)}% of GDP` : "n/a"
              )}
            />
            <DebtRow
              label="Trajectory"
              cells={debtSides.map((debt) =>
                debt
                  ? {
                      text: TRAJECTORY_LABEL[debt.trajectory],
                      className: debt.trajectory === "rising" ? "text-warning" : "",
                    }
                  : "n/a"
              )}
            />
            <DebtRow
              label="To hold flat"
              cells={debtSides.map((debt) =>
                debt ? balanceNeededLabel(debt.stabilisingPrimaryBalancePct) : "n/a"
              )}
            />
          </div>
        </div>
      )}
    </section>
  );
}

const TRAJECTORY_LABEL: Record<DebtTrajectory, string> = {
  rising: "Rising",
  stable: "Stable",
  falling: "Falling",
};

/** Positive means a surplus would hold the ratio flat; negative means a deficit can. */
function balanceNeededLabel(pct: number): string {
  if (Math.abs(pct) < 0.05) return "0.0% of GDP";
  return pct > 0
    ? `${pct.toFixed(1)}% surplus of GDP`
    : `${Math.abs(pct).toFixed(1)}% deficit of GDP`;
}

function DebtRow({ label, cells }: { label: string; cells: (string | DebtCell)[] }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,1.5fr)_1fr_1fr] items-center gap-x-2 border-b border-card-border/60 py-1.5">
      <span className="truncate text-body-sm text-muted">{label}</span>
      {cells.map((cell, index) => {
        const text = typeof cell === "string" ? cell : cell.text;
        const className = typeof cell === "string" ? "" : cell.className;
        return (
          <span key={index} className={`text-right text-body-sm tabular-nums ${className}`}>
            {text}
          </span>
        );
      })}
    </div>
  );
}

interface DebtCell {
  text: string;
  className?: string;
}

/** The stronger of two scores, or null when there is nothing to choose between. */
function leaderIndex(a: number | null, b: number | null): number | null {
  if (a === null || b === null || a === b) return null;
  return a > b ? 0 : 1;
}

function ScoreRow({ label, cells }: { label: string; cells: (RankedNation | null)[] }) {
  const leader = leaderIndex(cells[0]?.score ?? null, cells[1]?.score ?? null);
  return (
    <div className="grid grid-cols-[minmax(7rem,1.5fr)_1fr_1fr] items-center gap-x-2 border-b border-card-border py-1.5">
      <span className="truncate text-body-sm text-muted">{label}</span>
      {cells.map((cell, index) => (
        <span
          key={index}
          className={`text-right text-body-sm tabular-nums ${
            leader === index ? "font-semibold text-foreground" : "text-muted"
          }`}
        >
          {cell?.score ?? "n/a"}
          {cell?.rank != null && <span className="ml-1 text-muted">#{cell.rank}</span>}
        </span>
      ))}
    </div>
  );
}

function MetricRow({
  row,
  category,
  cells,
}: {
  row: CompareRow;
  category: MetricCategoryId | undefined;
  cells: (CompareRow["cells"][number] | null)[];
}) {
  const definition = category ? getMetricDefinition(category, row.metric) : undefined;
  const label = definition?.shortName ?? definition?.name ?? row.metric;
  const leader = leaderIndex(cells[0]?.score ?? null, cells[1]?.score ?? null);
  return (
    <div className="grid grid-cols-[minmax(7rem,1.5fr)_1fr_1fr] items-center gap-x-2 border-b border-card-border/60 py-1.5">
      <span className="truncate text-body-sm text-muted" title={definition?.name ?? row.metric}>
        {label}
      </span>
      {cells.map((cell, index) => {
        const value = cell?.value ?? null;
        const text =
          value === null
            ? "n/a"
            : definition
              ? formatMetricValue(value, definition)
              : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
        return (
          <span
            key={index}
            className={`text-right text-body-sm tabular-nums ${
              leader === index ? "font-semibold text-foreground" : "text-muted"
            }`}
          >
            {text}
            {cell?.rank != null && <span className="ml-1 text-muted">#{cell.rank}</span>}
          </span>
        );
      })}
    </div>
  );
}

const SERIES_COLORS = ["var(--primary, #3b82f6)", "var(--color-warning, #f59e0b)"] as const;

function SeriesChart({
  title,
  seriesA,
  seriesB,
  labels,
}: {
  title: string;
  seriesA: readonly { turn: number; rate: number }[];
  seriesB: readonly { turn: number; rate: number }[];
  labels: [string, string];
}) {
  const chart = buildCompareSeries(seriesA, seriesB);
  if (!chart) return null;
  return (
    <div className="rounded-lg border border-card-border bg-card px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-sm font-medium text-muted">{title}</span>
        <span className="text-[10px] tabular-nums text-muted">
          {chart.min.toFixed(1)} to {chart.max.toFixed(1)}%
        </span>
      </div>
      <svg
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        className="mt-1 h-14 w-full"
        role="img"
        aria-label={`${title}, ${labels[0]} against ${labels[1]}`}
      >
        <polyline
          points={chart.a}
          fill="none"
          stroke={SERIES_COLORS[0]}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={chart.b}
          fill="none"
          stroke={SERIES_COLORS[1]}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
        {[chart.latestA, chart.latestB].map((latest, index) => (
          <span key={index} className="flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: SERIES_COLORS[index] }}
            />
            <span className="truncate">{labels[index]}</span>
            <span className="tabular-nums text-foreground">
              {latest == null ? "n/a" : `${latest.toFixed(1)}%`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
