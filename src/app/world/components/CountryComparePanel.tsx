"use client";

import { useMemo, useState } from "react";
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
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import { useWorldMetricFilter, type WorldMetricsCountry } from "../WorldMetricFilterContext";

const SLOT_COUNT = 2;
const DEFAULT_CATEGORY: MetricCategoryId = "economic";

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
    toggleCompareCountry,
    clearCompare,
    worldMetrics,
  } = useWorldMetricFilter();
  const countryName = useCountryDisplayName();
  const [chosenCategory, setChosenCategory] = useState<MetricCategoryId>(DEFAULT_CATEGORY);

  // Every national document, keyed by country id. The ISO-keyed map is a subset,
  // so it is only used to fill in anything the by-id payload somehow misses.
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
  const category = categories.includes(chosenCategory) ? chosenCategory : categories[0];

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

  const cellFor = (row: CompareRow, id: CountryId | null) =>
    id ? (row.cells.find((cell) => cell.countryId === id) ?? null) : null;

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
              onClick={() => setChosenCategory(entry)}
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
    </section>
  );
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
