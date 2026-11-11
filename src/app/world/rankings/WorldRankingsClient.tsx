"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CountryFlag } from "@/components/CountryFlag";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { metricCategories, type MetricDefinition } from "@/lib/constants/metricDefinitions";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { MetricCategoryId } from "@/lib/db/types";
import {
  MAX_COMPARE_NATIONS,
  compareAcrossMetrics,
  rankNations,
  toggleCompared,
  type RankableCountry,
  type RankingSelection,
} from "@/lib/world/rankings";

/** One nation as `/api/world/metrics` returns it. */
interface MetricsCountry extends RankableCountry {
  categories: Record<string, Record<string, { value: number; score: number | null }>>;
}

interface WorldMetricsResponse {
  countries: Record<string, MetricsCountry>;
  /** Every national document keyed by country id; the ISO map above only covers the map's four. */
  countriesById?: Record<string, MetricsCountry>;
  availableCategories: MetricCategoryId[];
  availableMetrics: Record<string, string[]>;
}

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  metricCategories.map((category) => [category.id, category.name])
);

const METRIC_DEFINITIONS = new Map<string, MetricDefinition>(
  metricCategories.flatMap((category) => category.metrics.map((metric) => [metric.id, metric]))
);

const KNOWN_COUNTRIES = new Set(Object.keys(COUNTRY_CLIENT_CONFIGS));

function parseSelection(key: string): RankingSelection {
  const [kind, category, metric] = key.split(":");
  if (kind === "category" && category) {
    return { kind: "category", category: category as MetricCategoryId };
  }
  if (kind === "metric" && category && metric) {
    return { kind: "metric", category: category as MetricCategoryId, metric };
  }
  return { kind: "overall" };
}

function formatValue(value: number | null, definition?: MetricDefinition): string {
  if (value === null || !Number.isFinite(value)) return "No data";
  const decimals = definition?.decimals ?? 1;
  const body = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${definition?.formatPrefix ?? ""}${body}${definition?.formatSuffix ?? ""}`;
}

function selectionLabel(selection: RankingSelection): string {
  if (selection.kind === "overall") return "Overall score";
  if (selection.kind === "category") {
    return `${CATEGORY_LABELS[selection.category] ?? selection.category} score`;
  }
  return METRIC_DEFINITIONS.get(selection.metric)?.name ?? selection.metric;
}

const TH = "border-b border-card-border pb-2 pr-4 text-left text-body-sm font-medium text-muted";
const TD = "border-b border-card-border/60 py-2.5 pr-4 align-middle";

export default function WorldRankingsClient() {
  const [state, setState] = useState<{
    status: "loading" | "error" | "ready";
    data: WorldMetricsResponse | null;
  }>({ status: "loading", data: null });
  const [selectionKeyValue, setSelectionKeyValue] = useState("overall");
  const [compared, setCompared] = useState<string[]>([]);
  const [compareCategory, setCompareCategory] = useState<string>("economic");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/world/metrics", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((payload: WorldMetricsResponse) => {
        if (!controller.signal.aborted) setState({ status: "ready", data: payload });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "error", data: null });
      });
    return () => controller.abort();
  }, []);

  const selection = parseSelection(selectionKeyValue);
  const countries = useMemo<MetricsCountry[]>(() => {
    const data = state.data;
    if (!data) return [];
    const source = data.countriesById ?? data.countries;
    return Object.values(source).sort((a, b) => a.name.localeCompare(b.name));
  }, [state.data]);

  const ranking = useMemo(() => rankNations(countries, selection), [countries, selection]);

  const compareRows = useMemo(() => {
    const data = state.data;
    if (!data || compared.length < 2) return [];
    return compareAcrossMetrics({
      countries,
      countryIds: compared,
      category: compareCategory as MetricCategoryId,
      metrics: data.availableMetrics[compareCategory] ?? [],
    });
  }, [compared, compareCategory, countries, state.data]);

  const byCountryId = useMemo(
    () => new Map(countries.map((country) => [country.countryId, country])),
    [countries]
  );

  const metricDefinition =
    selection.kind === "metric" ? METRIC_DEFINITIONS.get(selection.metric) : undefined;

  const rankedCount = ranking.filter((row) => row.rank !== null).length;

  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <p className="text-body-sm font-medium text-muted">
          <Link href="/world" className="underline-offset-4 hover:underline">
            World
          </Link>{" "}
          / Rankings
        </p>
        <h1 className="mt-2 text-display font-bold tracking-tight text-foreground sm:text-[2.25rem] sm:leading-tight">
          Nations ranked
        </h1>
        <p className="mt-2 text-body-lg text-muted">
          Every nation in the world on one statistic at a time. Ranks come from the score, which
          already knows whether a figure is better high or low, so an unemployment rate ranks a
          tight labour market first. Pick a statistic, then pick nations to compare.
        </p>
      </header>

      {state.status === "error" ? (
        <div className="rounded-xl border border-card-border bg-card p-6 text-center text-body text-muted">
          The world figures did not load. Reload the page to try again.
        </div>
      ) : state.status === "loading" ? (
        <div className="h-72 animate-pulse rounded-xl bg-card-muted/60" aria-hidden />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-body-sm font-medium text-muted">Statistic</span>
              <select
                value={selectionKeyValue}
                onChange={(event) => setSelectionKeyValue(event.target.value)}
                className="min-w-[16rem] rounded-md border border-card-border bg-card px-3 py-2 text-body text-foreground"
              >
                <option value="overall">Overall score</option>
                {Object.entries(state.data?.availableMetrics ?? {}).map(([category, metrics]) => (
                  <optgroup key={category} label={CATEGORY_LABELS[category] ?? category}>
                    <option value={`category:${category}`}>
                      {CATEGORY_LABELS[category] ?? category} score
                    </option>
                    {metrics.map((metric) => (
                      <option key={metric} value={`metric:${category}:${metric}`}>
                        {METRIC_DEFINITIONS.get(metric)?.name ?? metric}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <p className="pb-2 text-body-sm text-muted">
              {rankedCount} {rankedCount === 1 ? "nation" : "nations"} ranked on{" "}
              {selectionLabel(selection).toLowerCase()}.
            </p>
          </div>

          <section
            className="overflow-x-auto"
            aria-label={`Nations ranked by ${selectionLabel(selection)}`}
          >
            <table className="w-full border-collapse text-body">
              <thead>
                <tr>
                  <th scope="col" className={`${TH} w-12`}>
                    Rank
                  </th>
                  <th scope="col" className={TH}>
                    Nation
                  </th>
                  {selection.kind === "metric" && (
                    <th scope="col" className={`${TH} text-right`}>
                      {selectionLabel(selection)}
                    </th>
                  )}
                  <th scope="col" className={`${TH} text-right`}>
                    Score
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Compare
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row) => {
                  const isCompared = compared.includes(row.countryId);
                  const isKnown = KNOWN_COUNTRIES.has(row.countryId);
                  return (
                    <tr key={row.countryId} className="transition-colors hover:bg-card-elevated/40">
                      <td className={`${TD} font-mono text-body font-bold tabular-nums`}>
                        {row.rank ?? "—"}
                      </td>
                      <td className={TD}>
                        <div className="flex items-center gap-2.5">
                          {isKnown ? (
                            <CountryFlag country={row.countryId as CountryId} size="md" />
                          ) : null}
                          <span className="font-medium text-foreground">{row.name}</span>
                        </div>
                      </td>
                      {selection.kind === "metric" && (
                        <td className={`${TD} text-right tabular-nums text-foreground`}>
                          {formatValue(row.value, metricDefinition)}
                        </td>
                      )}
                      <td className={`${TD} text-right tabular-nums text-muted`}>
                        {row.score === null ? "—" : Math.round(row.score)}
                      </td>
                      <td className={`${TD} text-right`}>
                        <button
                          type="button"
                          onClick={() =>
                            setCompared((current) =>
                              toggleCompared(current, row.countryId, MAX_COMPARE_NATIONS)
                            )
                          }
                          aria-pressed={isCompared}
                          className={`rounded-md border px-2.5 py-1 text-body-sm font-medium transition-colors ${
                            isCompared
                              ? "border-card-border bg-card-elevated text-foreground"
                              : "border-transparent text-muted hover:bg-card-muted hover:text-foreground"
                          }`}
                        >
                          {isCompared ? "Selected" : "Compare"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-body-sm text-muted">
              Only nations with a national metrics document are listed. Nations still being brought
              into the world appear here as their figures land.
            </p>
          </section>

          <section className="space-y-3" aria-label="Compare nations">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-heading-lg font-semibold tracking-tight text-foreground">
                Compare nations
              </h2>
              {compared.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCompared([])}
                  className="text-body-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline"
                >
                  Clear comparison
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {compared.length === 0 ? (
                <p className="text-body text-muted">
                  Pick two or three nations above to compare them across a whole category of
                  statistics.
                </p>
              ) : (
                compared.map((countryId) => (
                  <span
                    key={countryId}
                    className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card px-3 py-1 text-body-sm text-foreground"
                  >
                    {byCountryId.get(countryId)?.name ?? countryId}
                    <button
                      type="button"
                      onClick={() => setCompared((current) => toggleCompared(current, countryId))}
                      aria-label={`Remove ${byCountryId.get(countryId)?.name ?? countryId} from the comparison`}
                      className="text-muted hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>

            {compared.length > 0 && (
              <label className="flex max-w-xs flex-col gap-1">
                <span className="text-body-sm font-medium text-muted">Compare across</span>
                <select
                  value={compareCategory}
                  onChange={(event) => setCompareCategory(event.target.value)}
                  className="rounded-md border border-card-border bg-card px-3 py-2 text-body text-foreground"
                >
                  {Object.keys(state.data?.availableMetrics ?? {}).map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_LABELS[category] ?? category}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {compared.length >= 2 && compareRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-body">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>
                        Statistic
                      </th>
                      {compared.map((countryId) => (
                        <th key={countryId} scope="col" className={`${TH} text-right`}>
                          {byCountryId.get(countryId)?.name ?? countryId}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((row) => (
                      <tr key={row.metric} className="transition-colors hover:bg-card-elevated/40">
                        <td className={`${TD} text-muted`}>
                          {METRIC_DEFINITIONS.get(row.metric)?.name ?? row.metric}
                        </td>
                        {row.cells.map((cell) => (
                          <td
                            key={cell.countryId}
                            className={`${TD} text-right tabular-nums text-foreground`}
                          >
                            {formatValue(cell.value, METRIC_DEFINITIONS.get(row.metric))}
                            <span className="ml-2 text-body-sm text-muted">
                              {cell.rank === null ? "—" : `#${cell.rank}`}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-body-sm text-muted">
                  Each rank is among every nation scored on that statistic, not just the ones shown.
                  A dash means the world has no scored figure for it.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
