"use client";
import type {
  ResetMetricCountry,
  ResetMetricRow,
  ResetMetricBoardResponse,
  MetricCategory,
} from "@/components/metrics/MetricBoardDetails";
import {
  CATEGORY_ICONS,
  readableCategory,
  CategoryDetail,
  MetricDetail,
} from "@/components/metrics/MetricBoardDetails";
export type {
  ResetMetricCountry,
  ResetMetricRow,
  ResetMetricBoardResponse,
} from "@/components/metrics/MetricBoardDetails";

import { useMemo, useState } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { LiveDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CategoryIcon } from "@/app/country/[code]/political-metrics/components/categoryIcons";

import { GovernanceStyleCard } from "@/app/country/[code]/political-metrics/components/GovernanceStyleCard";

import { ResetMetricCompare } from "./ResetMetricCompare";
import { metricDomainId } from "@/lib/resetMetrics/presentation";

const COUNTRY_CHROME: Record<
  ResetMetricCountry,
  { registry: string; seal: string; glyph: string }
> = {
  CA: {
    registry: "Government of Canada · National Situation Registry",
    seal: "Statistics Canada",
    glyph: "CA",
  },
  US: {
    registry: "Executive Office · National Situation Registry",
    seal: "Dept of National Statistics",
    glyph: "US",
  },
  UK: {
    registry: "Cabinet Office · Central Statistical Office",
    seal: "Central Statistical Office",
    glyph: "UK",
  },
  JP: {
    registry: "Cabinet Office · Statistics Bureau",
    seal: "Statistics Bureau of Japan",
    glyph: "日",
  },
  IE: {
    registry: "Government of Ireland · National Situation Registry",
    seal: "Central Statistics Office",
    glyph: "IE",
  },
  SCO: {
    registry: "Scottish Government · National Situation Registry",
    seal: "National Records of Scotland",
    glyph: "SC",
  },
  WAL: {
    registry: "Welsh Government · National Situation Registry",
    seal: "Statistics for Wales",
    glyph: "CY",
  },
};

function RegistryMasthead({
  board,
  displayName,
  countryName,
  regionLabel,
  onCompare,
}: {
  board: ResetMetricBoardResponse;
  displayName: string;
  countryName: string;
  regionLabel: string;
  onCompare: () => void;
}) {
  const chrome = COUNTRY_CHROME[board.countryId];
  const registry =
    board.scope === "national"
      ? chrome.registry
      : `${displayName} · ${regionLabel} Situation Registry`;
  const seal = board.scope === "national" ? chrome.seal : `${countryName} · ${regionLabel}`;
  const glyph = board.scope === "national" ? chrome.glyph : (board.regionId ?? chrome.glyph);

  return (
    <header
      data-testid="stat-masthead"
      className="overflow-hidden rounded-lg border border-card-border bg-card shadow-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-border px-4 py-2 font-mono text-body-xs uppercase tracking-widest text-muted">
        <span>{registry}</span>
        <span className="inline-flex items-center gap-2">
          <LiveDot color="success" />
          LIVE · CURRENT SERIES
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4 p-4">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md border-2 border-success bg-card-muted font-mono text-heading-sm font-bold text-success"
        >
          {glyph}
        </div>
        <div className="min-w-[220px] flex-1">
          <h1 className="text-display font-bold leading-tight text-foreground">{displayName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-body-xs font-bold tracking-wider text-success">
              <span>{board.metrics.length}</span>
              <span>METRICS TRACKED</span>
            </span>
            <span className="font-mono text-body-xs text-muted">
              TURN {board.asOfTurn.toLocaleString("en-US")}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCompare}>
            ⇄ Compare
          </Button>
          <span className="font-mono text-body-xs uppercase tracking-widest text-muted">
            {seal}
          </span>
        </div>
      </div>
      <div className="h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
    </header>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border-l border-card-border px-4 py-3 first:border-l-0">
      <div className="font-mono text-body-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-body-lg font-bold tabular-nums text-foreground">{value}</div>
      <div className="text-body-xs text-muted">{sub}</div>
    </div>
  );
}

function RegistrySummary({
  board,
  categories,
}: {
  board: ResetMetricBoardResponse;
  categories: MetricCategory[];
}) {
  const provisional = categories.reduce((total, category) => total + category.provisional, 0);
  const influenced = categories.reduce((total, category) => total + category.influenced, 0);
  const sourced = board.metrics.length - provisional;
  const scores = board.metrics
    .map((metric) => metric.conditionScore)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  const averageScore =
    scores.length > 0 ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
  const averageScoreShare =
    averageScore === null ? 0 : Math.max(0, Math.min(100, averageScore)) / 100;
  const ringSize = 84;
  const radius = (ringSize - 8) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-card-border bg-card p-0 shadow-card">
      <div className="grid grid-cols-2 lg:grid-cols-[minmax(250px,1.5fr)_repeat(4,minmax(0,1fr))]">
        <div className="col-span-2 flex items-center gap-4 border-b border-card-border px-4 py-3 lg:col-span-1 lg:border-b-0 lg:border-r">
          <span
            className="relative inline-flex text-success"
            aria-label={
              averageScore === null
                ? "Average condition score unavailable"
                : `Average condition score ${averageScore.toFixed(1)} out of 100`
            }
          >
            <svg width={ringSize} height={ringSize} className="-rotate-90">
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                className="stroke-track"
                strokeWidth="7"
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference.toFixed(1)}
                strokeDashoffset={(circumference * (1 - averageScoreShare)).toFixed(1)}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="text-heading font-extrabold tabular-nums">
                {averageScore === null ? "n/a" : averageScore.toFixed(1)}
              </span>
            </span>
          </span>
          <div>
            <div className="font-mono text-body-xs uppercase tracking-widest text-muted">
              Average score
            </div>
            <div className="mt-0.5 text-heading font-semibold text-foreground">
              {categories.length} outcome domains
            </div>
            <div className="text-body-xs text-muted">
              Mean of all {scores.length} scored metrics, out of 100
            </div>
          </div>
        </div>
        <SummaryTile
          label="As of turn"
          value={board.asOfTurn.toLocaleString("en-US")}
          sub="current world"
        />
        <SummaryTile
          label="Sourced"
          value={String(sourced)}
          sub="observed, or worked out from game systems"
        />
        <SummaryTile
          label="Provisional"
          value={String(provisional)}
          sub="game-calibrated stand-in, no observed figure"
        />
        <SummaryTile label="Active pressure" value={String(influenced)} sub="law or Cabinet" />
      </div>
    </div>
  );
}

function CategoryOverview({
  board,
  categories,
  displayName,
  countryName,
  onOpenCategory,
}: {
  board: ResetMetricBoardResponse;
  categories: MetricCategory[];
  displayName: string;
  countryName: string;
  onOpenCategory: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <RegistrySummary board={board} categories={categories} />
      {board.governanceStyle && (
        <GovernanceStyleCard
          score={board.governanceStyle}
          scopeNote={
            board.scope === "regional"
              ? `${displayName}'s v2 observations and laws determine the local axes. Balance of power uses ${countryName}'s national institutions.`
              : undefined
          }
        />
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => {
          const sourced = category.metrics.length - category.provisional;
          const score = category.conditionScore;
          return (
            <div
              key={category.id}
              role="button"
              tabIndex={0}
              aria-label={`Open ${category.name}`}
              onClick={() => onOpenCategory(category.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onOpenCategory(category.id);
              }}
              className="card-hover flex cursor-pointer flex-col gap-3 rounded-lg border border-card-border bg-card p-4 shadow-card"
            >
              <div className="flex items-start gap-2">
                <span className="text-primary">
                  <CategoryIcon
                    icon={CATEGORY_ICONS[category.id] ?? "library"}
                    className="h-4 w-4"
                  />
                </span>
                <h2 className="flex-1 text-body font-semibold leading-tight text-foreground">
                  {category.name}
                </h2>
                <div className="flex items-center gap-1 text-right">
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-muted">
                      Condition
                    </div>
                    <div className="text-heading font-extrabold tabular-nums text-success">
                      {score === null ? "n/a" : Math.round(score)}
                      {score !== null && (
                        <span className="text-body-xs font-normal text-muted">/100</span>
                      )}
                    </div>
                  </div>
                  <InfoTooltip
                    trigger={<span className="cursor-help text-muted">ⓘ</span>}
                    width={300}
                  >
                    Average of the 0-100 condition scores of the metrics in this domain, shown on
                    each metric row. Raw metrics retain their real units, and context measures use
                    tailored calibration instead of a blanket higher-is-better rule.
                  </InfoTooltip>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-body-sm">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    Sourced
                  </div>
                  <div className="mt-1 font-bold tabular-nums text-foreground">{sourced}</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    Provisional
                  </div>
                  <div className="mt-1 font-bold tabular-nums text-warning">
                    {category.provisional}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    Pressure
                  </div>
                  <div className="mt-1 font-bold tabular-nums text-foreground">
                    {category.influenced}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-dashed border-card-border pt-2 text-body-xs text-muted">
                <span>{category.metrics.length} primary observations</span>
                <span className="whitespace-nowrap">open →</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 font-mono text-body-xs uppercase tracking-wider text-muted">
        <span>Values retain their real units</span>
        <span>Direction explains how to read each measure</span>
        <span>Provisional means a game-calibrated stand-in where no observed figure exists</span>
        <span>
          A domain score is the mean of the 0-100 condition scores of its metrics, not of the values
          shown
        </span>
      </div>
    </section>
  );
}

export function ResetMetricBoard({
  board,
  displayName,
  countryName,
  regionLabel,
}: {
  board: ResetMetricBoardResponse;
  displayName: string;
  countryName: string;
  regionLabel: string;
}) {
  const categories = useMemo(() => {
    const groups = new Map<string, ResetMetricRow[]>();
    for (const row of board.metrics) {
      const category = metricDomainId(row);
      groups.set(category, [...(groups.get(category) ?? []), row]);
    }
    return [...groups.entries()].map(([id, metrics]) => {
      const scores = metrics
        .map((metric) => metric.conditionScore)
        .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
      return {
        id,
        name: readableCategory(id),
        metrics,
        provisional: metrics.filter((metric) => metric.observation.status === "proxy").length,
        influenced: metrics.filter(
          (metric) => metric.temporaryActionEffect || metric.legislativeEffect
        ).length,
        conditionScore:
          scores.length > 0
            ? scores.reduce((total, score) => total + score, 0) / scores.length
            : null,
        scoredMetrics: scores.length,
      };
    });
  }, [board.metrics]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeMetricId, setActiveMetricId] = useState<string | null>(null);
  const [comparisonCategoryId, setComparisonCategoryId] = useState<string | null | undefined>(
    undefined
  );
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? null;
  const activeMetric = board.metrics.find((metric) => metric.id === activeMetricId) ?? null;

  return (
    <div className="flex min-w-0 flex-col">
      <RegistryMasthead
        board={board}
        displayName={displayName}
        countryName={countryName}
        regionLabel={regionLabel}
        onCompare={() => setComparisonCategoryId(null)}
      />
      {comparisonCategoryId !== undefined ? (
        <ResetMetricCompare
          home={board}
          homeName={displayName}
          regionLabel={regionLabel}
          initialCategoryId={comparisonCategoryId ?? undefined}
          onBack={() => setComparisonCategoryId(undefined)}
        />
      ) : activeMetric ? (
        <MetricDetail
          board={board}
          metric={activeMetric}
          displayName={displayName}
          onBack={() => setActiveMetricId(null)}
          onOpenMetric={(metric) => setActiveMetricId(metric.id)}
        />
      ) : activeCategory ? (
        <CategoryDetail
          board={board}
          category={activeCategory}
          displayName={displayName}
          onBack={() => setActiveCategoryId(null)}
          onOpenMetric={(metric) => setActiveMetricId(metric.id)}
          onCompareCategory={() => setComparisonCategoryId(activeCategory.id)}
        />
      ) : (
        <CategoryOverview
          board={board}
          categories={categories}
          displayName={displayName}
          countryName={countryName}
          onOpenCategory={setActiveCategoryId}
        />
      )}
    </div>
  );
}

export default ResetMetricBoard;
