"use client";
import { metricHasPolicyPressure } from "@/lib/resetMetrics/presentation";
import {
  MAX_POLICY_PRESSURE,
  type MetricPolicyPressure,
} from "@/lib/resetMetrics/rules/policyPressure";
import { useEffect, useMemo, useState } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";

import { Button } from "@/components/ui/Button";
import { CategoryIcon } from "@/app/country/[code]/political-metrics/components/categoryIcons";
import { currencySymbolSep } from "@/lib/currency/symbolSep";
import type { PrimaryMetricDefinition } from "@/lib/resetMetrics/catalog";
import type { OpeningMetricObservation } from "@/lib/resetMetrics/rules/openingObservation";
import { getCurrencyPrefix } from "@/lib/utils/budgetCalculations";

import type { GovernanceStyleScore } from "@/lib/governanceStyle/score";
import type { MetricLawState } from "@/lib/resetLegislation/rules/metricPolicyStatus";
import {
  metricAggregationLabel,
  metricDataBasis,
  metricOwnerLabel,
  metricQualityExplanation,
  metricQualityLabel,
  metricRefreshLabel,
  metricDomainId,
  metricFreshnessLabel,
  playerMetricDescription,
} from "@/lib/resetMetrics/presentation";

import {
  ResetMetricHistoryChart,
  type ResetMetricDetailResponse,
} from "@/components/metrics/ResetMetricHistoryChart";
import type { ResetV2Country } from "@/lib/resetVersions/rules";

export type ResetMetricCountry = ResetV2Country;

export type ResetMetricRow = PrimaryMetricDefinition & {
  observation: OpeningMetricObservation;
  conditionScore: number | null;
  policyPressure?: MetricPolicyPressure | null;
  temporaryActionEffect: {
    favorableNormalizedPoints: number;
    contributingActions: string[];
  } | null;
  legislativeEffect: {
    favorableNormalizedPoints: number;
    contributingPrograms: string[];
  } | null;
  standingLaws: {
    familyId: string;
    familyTitle: string;
    currentLawTitle: string;
    policyLevelTitle: string;
    state: MetricLawState;
    favorableNormalizedPoints: number | null;
    nextFundingTurn?: number | null;
  }[];
};

export type ResetMetricBoardResponse = {
  version: "v2";
  countryId: ResetMetricCountry;
  scope: "national" | "regional";
  regionId: string | null;
  asOfTurn: number;
  governanceStyle: GovernanceStyleScore | null;
  metrics: ResetMetricRow[];
};

export type MetricCategory = {
  id: string;
  name: string;
  metrics: ResetMetricRow[];
  provisional: number;
  influenced: number;
  conditionScore: number | null;
  scoredMetrics: number;
};

export const CATEGORY_ICONS: Record<string, string> = {
  economic: "currency",
  social: "users",
  governance: "library",
  education: "cap",
  healthcare: "heart",
  infrastructure: "building",
  publicSafety: "scales",
  environment: "globe",
  mediaInformation: "library",
  population: "users",
  security: "shield",
};

export function readableCategory(category: string): string {
  return category
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function valueLabel(row: ResetMetricRow, countryId: ResetMetricCountry): string {
  const value = row.observation.value;
  if (value === null) return "Unavailable";
  if (row.id === "02") {
    const symbol = getCurrencyPrefix(countryId);
    const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
    return `${symbol}${currencySymbolSep(symbol)}${formatted}`;
  }
  const precision = Math.abs(value) < 10 ? 2 : 1;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: precision,
  }).format(value);
  return `${formatted}${row.unit.startsWith("%") ? "" : " "}${row.unit}`;
}

export function interpretationLabel(
  interpretation: PrimaryMetricDefinition["interpretation"]
): string {
  switch (interpretation) {
    case "higher":
      return "Higher is generally better";
    case "lower":
      return "Lower is generally better";
    case "band":
      return "A balanced range is preferred";
    case "context":
      return "Direction depends on context";
  }
}

export function interpretationShort(
  interpretation: PrimaryMetricDefinition["interpretation"]
): string {
  switch (interpretation) {
    case "higher":
      return "Higher";
    case "lower":
      return "Lower";
    case "band":
      return "Band";
    case "context":
      return "Context";
  }
}

export function interpretationTone(
  interpretation: PrimaryMetricDefinition["interpretation"]
): string {
  switch (interpretation) {
    case "higher":
      return "border-success/40 bg-success/10 text-success";
    case "lower":
      return "border-warning/40 bg-warning/10 text-warning";
    case "band":
      return "border-primary/40 bg-primary/10 text-primary";
    case "context":
      return "border-card-border bg-card-muted text-muted";
  }
}

export function regionalDifferenceLabel(
  metric: ResetMetricRow,
  countryId: ResetMetricCountry,
  delta: number
): { text: string; className: string } {
  if (Math.abs(delta) < 0.005)
    return { text: "Matches the national figure", className: "text-muted" };
  const absolute = Math.abs(delta);
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(absolute);
  let amount: string;
  if (metric.id === "02") {
    const symbol = getCurrencyPrefix(countryId);
    amount = `${symbol}${currencySymbolSep(symbol)}${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(absolute)}`;
  } else if (metric.unit.startsWith("%")) {
    amount = `${formatted} percentage ${absolute === 1 ? "point" : "points"}`;
  } else if (metric.unit.includes("index") || metric.unit.includes("Gini points")) {
    amount = `${formatted} ${absolute === 1 ? "point" : "points"}`;
  } else if (metric.unit.includes("years")) {
    amount = `${formatted} ${absolute === 1 ? "year" : "years"}`;
  } else {
    amount = `${formatted} ${metric.unit}`;
  }

  if (metric.interpretation === "higher" || metric.interpretation === "lower") {
    const favorable =
      (metric.interpretation === "higher" && delta > 0) ||
      (metric.interpretation === "lower" && delta < 0);
    return {
      text: `${amount} ${favorable ? "better" : "worse"} than national`,
      className: favorable ? "text-success" : "text-error",
    };
  }
  return {
    text: `${amount} ${delta > 0 ? "above" : "below"} national`,
    className: "text-muted",
  };
}

export function ordinal(value: number): string {
  const remainder100 = value % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function regionalRankLabel(
  metric: ResetMetricRow,
  regions: ResetMetricDetailResponse["regions"],
  regionId: string | null,
  value: number
): string | null {
  const observations = regions.filter((region) => Number.isFinite(region.value));
  if (observations.length === 0) return null;
  const includesCurrent = observations.some((region) => region.regionId === regionId);
  const total = observations.length + (includesCurrent ? 0 : 1);
  const outranking = observations.filter((region) =>
    metric.interpretation === "lower" ? region.value < value : region.value > value
  ).length;
  const rank = outranking + 1;
  if (metric.interpretation === "higher" || metric.interpretation === "lower") {
    return `${ordinal(rank)} of ${total} nationally`;
  }
  return `Value rank: ${ordinal(rank)} highest of ${total} nationally`;
}

export function EffectLine({
  label,
  points,
  sources,
}: {
  label: string;
  points: number;
  sources: string[];
}) {
  const favorable = points >= 0;
  return (
    <p
      className={`text-[11px] font-semibold ${favorable ? "text-success" : "text-error"}`}
      title={`${label}: ${sources.join(", ")}`}
    >
      {favorable ? "+" : ""}
      {points.toFixed(2)} {label.toLowerCase()}
    </p>
  );
}

export function EffectDetail({
  label,
  points,
  sources,
}: {
  label: string;
  points: number;
  sources: string[];
}) {
  return (
    <div className="rounded-md border border-card-border bg-card-muted p-3">
      <EffectLine label={label} points={points} sources={sources} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <span
            key={source}
            className="rounded border border-card-border bg-card px-2 py-0.5 font-mono text-[10px] text-foreground"
          >
            {source}
          </span>
        ))}
      </div>
    </div>
  );
}

export function lawStatePresentation(
  state: MetricLawState,
  interpretation: PrimaryMetricDefinition["interpretation"],
  turnsUntilFunding?: number | null
): { label: string; className: string; explanation: string } {
  if (state === "equilibrium") {
    return {
      label: "At equilibrium",
      className: "text-success",
      explanation:
        "This standing law's effects are already reflected in the current metric value, so it adds no further modeled movement.",
    };
  }
  if (state === "awaiting_first_funding") {
    const due =
      turnsUntilFunding && turnsUntilFunding > 0
        ? ` The first round is due in ${turnsUntilFunding} ${turnsUntilFunding === 1 ? "turn" : "turns"}.`
        : "";
    return {
      label: "Awaiting first funding",
      className: "text-muted",
      explanation: `The law is in force. Its programme is funded in the annual budget round and has not had one yet, so it is not moving this metric yet.${due}`,
    };
  }
  if (state === "implementation_stalled") {
    return {
      label: "Implementation stalled",
      className: "text-warning",
      explanation:
        "The law remains in force, but its responsible agency is not delivering funded capacity, so it is not moving this metric.",
    };
  }

  const favorable = state === "pushing_favorable";
  let label: string;
  if (interpretation === "higher") {
    label = favorable ? "Pushing upward" : "Pulling downward";
  } else if (interpretation === "lower") {
    label = favorable ? "Pulling downward" : "Pushing upward";
  } else {
    label = favorable
      ? "Moving toward the preferred range"
      : "Moving away from the preferred range";
  }
  return {
    label,
    className: favorable ? "text-success" : "text-error",
    explanation: favorable
      ? "This funded law contributes favorable modeled effects. Its net policy driver also subtracts the opening-law baseline."
      : "This funded law contributes unfavorable modeled effects. Its net policy driver also subtracts the opening-law baseline.",
  };
}

export function StandingLawDetail({
  law,
  interpretation,
  asOfTurn,
}: {
  law: ResetMetricRow["standingLaws"][number];
  interpretation: PrimaryMetricDefinition["interpretation"];
  asOfTurn?: number;
}) {
  const presentation = lawStatePresentation(
    law.state,
    interpretation,
    law.nextFundingTurn != null && asOfTurn != null ? law.nextFundingTurn - asOfTurn : null
  );
  return (
    <div className="rounded-md border border-card-border bg-card-muted p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-foreground">{law.currentLawTitle}</div>
          <div className="mt-0.5 text-body-xs text-muted">
            {law.familyTitle} · {law.policyLevelTitle}
          </div>
        </div>
        <span
          className={`flex-shrink-0 rounded border border-card-border bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${presentation.className}`}
        >
          {presentation.label}
        </span>
      </div>
      <p className="mt-2 text-body-xs leading-relaxed text-muted">{presentation.explanation}</p>
      {law.favorableNormalizedPoints !== null &&
        law.state !== "implementation_stalled" &&
        law.state !== "awaiting_first_funding" && (
          <div className={`mt-2 text-body-xs font-semibold ${presentation.className}`}>
            {law.favorableNormalizedPoints >= 0 ? "+" : ""}
            {law.favorableNormalizedPoints.toFixed(2)} gross law contribution before opening
            baseline
          </div>
        )}
    </div>
  );
}

function PolicyPressureSummary({ pressure }: { pressure: MetricPolicyPressure }) {
  const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
  return (
    <div className="mt-2 text-body-xs text-muted">
      <p>
        Current law contribution {signed(pressure.grossLaw)}; opening-law baseline{" "}
        {signed(pressure.openingLaw)}; law change {signed(pressure.netLaw)}; Cabinet{" "}
        {signed(pressure.cabinet)}.
      </p>
      <p>
        Combined policy driver: {signed(pressure.combined)} after the ±
        {MAX_POLICY_PRESSURE.toFixed(2)} limit. Favorable pressure is positive. This is not a change
        per turn; market conditions, other gameplay drivers and the responsible simulation also
        affect the result. Directly measured outcomes can differ from this modeled driver. National
        figures can also reflect regional policies. Existing infrastructure and opening conditions
        do not disappear when a policy driver is zero. Opening statutes without a booked spending
        obligation remain in force without requiring a funding receipt.
      </p>
    </div>
  );
}

export function ConditionScoreLabel({ score }: { score: number | null }) {
  if (score === null || !Number.isFinite(score)) return <>Not scored</>;
  return (
    <>
      Score <span className="font-semibold tabular-nums text-foreground">{Math.round(score)}</span>
      /100
    </>
  );
}

export function MetricRow({
  countryId,
  metric,
  onOpen,
}: {
  countryId: ResetMetricCountry;
  metric: ResetMetricRow;
  onOpen: () => void;
}) {
  return (
    <article className="rounded-lg border border-card-border bg-card shadow-card transition-colors">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${metric.name}`}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onOpen();
        }}
        className="card-hover flex cursor-pointer items-center gap-4 rounded-lg p-4"
      >
        <div className="w-24 flex-shrink-0 text-center">
          <span
            className={`inline-flex rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${interpretationTone(metric.interpretation)}`}
          >
            {interpretationShort(metric.interpretation)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-body font-semibold leading-snug text-foreground">{metric.name}</h3>
            <InfoTooltip
              trigger={
                <span className="select-none text-[13px] leading-none text-muted/60">ⓘ</span>
              }
              width={300}
            >
              <p className="font-semibold text-foreground">{metric.name}</p>
              <p className="mt-1 leading-relaxed text-muted">{playerMetricDescription(metric)}</p>
              <p className="mt-2 border-t border-card-border/50 pt-2 text-muted">
                {interpretationLabel(metric.interpretation)}. Owner: {metric.owner}.
              </p>
            </InfoTooltip>
          </div>
          <p className="mt-0.5 text-body-sm leading-normal text-muted">
            {playerMetricDescription(metric)}
          </p>
          {(metric.temporaryActionEffect || metric.legislativeEffect) && (
            <div className="mt-1.5 flex flex-wrap gap-3">
              {metric.temporaryActionEffect && (
                <EffectLine
                  label="Temporary Cabinet effect"
                  points={metric.temporaryActionEffect.favorableNormalizedPoints}
                  sources={metric.temporaryActionEffect.contributingActions}
                />
              )}
              {metric.legislativeEffect && (
                <EffectLine
                  label="Law change from opening"
                  points={metric.legislativeEffect.favorableNormalizedPoints}
                  sources={metric.legislativeEffect.contributingPrograms}
                />
              )}
            </div>
          )}
          {metric.policyPressure && (
            <p className="mt-1 text-body-xs text-muted">
              Combined policy driver: {metric.policyPressure.combined >= 0 ? "+" : ""}
              {metric.policyPressure.combined.toFixed(2)} after the policy limit. Open for the
              baseline and funding breakdown.
            </p>
          )}
        </div>
        <div className="w-72 max-w-[35%] flex-shrink-0 text-right">
          <div className="text-heading font-extrabold leading-tight tabular-nums text-foreground">
            {valueLabel(metric, countryId)}
          </div>
          <div
            className="mt-0.5 text-body-xs text-muted"
            title="Game-calibrated condition score. Higher is better; this is not the raw metric value."
          >
            Condition score:{" "}
            {metric.conditionScore === null
              ? "Not scored"
              : `${metric.conditionScore.toFixed(1)} / 100`}
          </div>
          <div className="mt-0.5 text-body-xs text-muted">
            {interpretationLabel(metric.interpretation)}
          </div>
          <div className="mt-0.5 text-body-xs text-muted">
            {metricFreshnessLabel(
              metric.observation.observedAtTurn ?? metric.observation.lastUpdatedTurn,
              metric.observation.source.includes("national rollup"),
              metric.refresh
            )}
          </div>
        </div>
        <span className="flex-shrink-0 text-muted">→</span>
      </div>
    </article>
  );
}

export function CategoryDetail({
  board,
  category,
  displayName,
  onBack,
  onOpenMetric,
  onCompareCategory,
}: {
  board: ResetMetricBoardResponse;
  category: MetricCategory;
  displayName: string;
  onBack: () => void;
  onOpenMetric: (metric: ResetMetricRow) => void;
  onCompareCategory: () => void;
}) {
  const [sort, setSort] = useState<"catalog" | "alpha" | "value">("catalog");
  const rows = useMemo(() => {
    const next = [...category.metrics];
    if (sort === "alpha") next.sort((left, right) => left.name.localeCompare(right.name));
    if (sort === "value") {
      next.sort(
        (left, right) =>
          (right.observation.value ?? Number.NEGATIVE_INFINITY) -
          (left.observation.value ?? Number.NEGATIVE_INFINITY)
      );
    }
    return next;
  }, [category.metrics, sort]);
  const sourced = category.metrics.length - category.provisional;

  return (
    <section className="mt-4 flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← {board.scope === "national" ? "National" : "Regional"} overview
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-card-border bg-card p-4 shadow-card">
        <span className="text-primary">
          <CategoryIcon icon={CATEGORY_ICONS[category.id] ?? "library"} className="h-6 w-6" />
        </span>
        <div className="min-w-[200px] flex-1">
          <h2 className="text-heading-lg font-bold text-foreground">{category.name}</h2>
          <div className="mt-0.5 text-body-sm text-muted">
            {displayName} · {category.metrics.length} simulation metrics in the units shown
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 font-mono text-body-xs uppercase tracking-wider text-muted">
            Domain condition
            <InfoTooltip trigger={<span className="cursor-help text-muted">ⓘ</span>} width={300}>
              Average of the domain&apos;s game-calibrated metric condition scores. It summarizes
              the underlying observations without replacing their real values.
            </InfoTooltip>
          </div>
          <div className="mt-1 text-display font-extrabold leading-none tabular-nums text-success">
            {category.conditionScore === null ? "n/a" : Math.round(category.conditionScore)}
            {category.conditionScore !== null && (
              <span className="text-body-sm font-normal text-muted">/100</span>
            )}
          </div>
        </div>
        <div className="text-body-sm text-muted">
          <div className="font-mono text-body-xs uppercase tracking-wider">Observation quality</div>
          <div className="mt-0.5">
            {sourced} recorded or derived · {category.provisional} provisional
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onCompareCategory}>
          Compare this domain
        </Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(250px,1fr)]">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-body-xs uppercase tracking-widest text-muted">
              Primary metrics · reported units
            </span>
            <label className="flex items-center gap-2 text-body-sm text-muted">
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className="rounded-md border border-card-border bg-card px-2 py-1 text-body-sm text-foreground"
              >
                <option value="catalog">Catalog order</option>
                <option value="alpha">Alphabetical</option>
                <option value="value">Observed value</option>
              </select>
            </label>
          </div>
          {rows.map((metric) => (
            <MetricRow
              key={metric.id}
              countryId={board.countryId}
              metric={metric}
              onOpen={() => onOpenMetric(metric)}
            />
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-card-border bg-card p-4 shadow-card">
            <div className="mb-2.5 font-mono text-body-xs uppercase tracking-widest text-muted">
              Reading direction
            </div>
            <div className="flex flex-col gap-2 text-body-xs text-muted">
              <span>
                <strong className="text-success">Higher:</strong> a higher value is generally
                favorable.
              </span>
              <span>
                <strong className="text-warning">Lower:</strong> a lower value is generally
                favorable.
              </span>
              <span>
                <strong className="text-primary">Band:</strong> a balanced range is preferred.
              </span>
              <span>
                <strong className="text-foreground">Context:</strong> direction depends on
                circumstances.
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-card-border bg-card p-4 shadow-card">
            <div className="mb-2.5 font-mono text-body-xs uppercase tracking-widest text-muted">
              Active policy pressure
            </div>
            {category.influenced > 0 ? (
              <div className="flex flex-col gap-1.5 text-body-sm text-foreground">
                {category.metrics.filter(metricHasPolicyPressure).map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    className="flex justify-between gap-3 text-left hover:text-primary"
                    onClick={() => onOpenMetric(metric)}
                  >
                    <span>{metric.name}</span>
                    <span className="shrink-0 text-muted">view →</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-body-sm italic text-muted">
                No nonzero policy driver is recorded for this category. Standing laws can maintain
                its opening baseline; other simulation drivers may still change its values.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-card-border bg-card p-4 shadow-card">
            <div className="mb-2.5 font-mono text-body-xs uppercase tracking-widest text-muted">
              Observation quality
            </div>
            <p className="text-body-sm leading-relaxed text-muted">
              {sourced} metrics use recorded or derived observations. {category.provisional} use
              clearly labeled game-calibrated estimates until a stronger source is available.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MetricDetail({
  board,
  metric,
  displayName,
  onBack,
  onOpenMetric,
}: {
  board: ResetMetricBoardResponse;
  metric: ResetMetricRow;
  displayName: string;
  onBack: () => void;
  onOpenMetric: (metric: ResetMetricRow) => void;
}) {
  const requestKey = JSON.stringify([board.countryId, board.regionId, metric.id]);
  const [result, setResult] = useState<{
    key: string;
    detail: ResetMetricDetailResponse | null;
    error: string | null;
  } | null>(null);
  const detail = result && result.key === requestKey ? result.detail : null;
  const error = result && result.key === requestKey ? result.error : null;
  useEffect(() => {
    const controller = new AbortController();
    const query = board.regionId ? `?region=${encodeURIComponent(board.regionId)}` : "";
    void fetch(`/api/country/${board.countryId}/reset-metrics/${metric.id}${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Metric detail could not be loaded");
        return (await response.json()) as ResetMetricDetailResponse;
      })
      .then((detail) => setResult({ key: requestKey, detail, error: null }))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setResult({
          key: requestKey,
          detail: null,
          error: cause instanceof Error ? cause.message : "Metric detail could not be loaded",
        });
      });
    return () => controller.abort();
  }, [board.countryId, board.regionId, metric.id, requestKey]);

  const related = board.metrics.filter(
    (candidate) =>
      candidate.id !== metric.id && metricDomainId(candidate) === metricDomainId(metric)
  );
  const regionalComparison =
    board.scope === "regional" && detail && metric.observation.value !== null
      ? regionalDifferenceLabel(
          metric,
          board.countryId,
          metric.observation.value - detail.nationalValue
        )
      : null;
  const regionalRank =
    board.scope === "regional" && detail && metric.observation.value !== null
      ? regionalRankLabel(metric, detail.regions, board.regionId, metric.observation.value)
      : null;
  return (
    <section className="mt-4 flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back to metrics
        </Button>
      </div>
      <header className="rounded-lg border border-card-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="font-mono text-body-xs uppercase tracking-widest text-muted">
              {displayName} · {readableCategory(metricDomainId(metric))}
            </div>
            <h2 className="mt-1 text-heading-lg font-bold text-foreground">{metric.name}</h2>
            <p className="mt-2 text-body leading-relaxed text-muted">
              {playerMetricDescription(metric)}
            </p>
          </div>
          <div className="text-right">
            <div className="text-heading-lg font-extrabold tabular-nums text-foreground">
              {valueLabel(metric, board.countryId)}
            </div>
            {regionalComparison && (
              <div className={`mt-1 text-body-xs tabular-nums ${regionalComparison.className}`}>
                {regionalComparison.text}
              </div>
            )}
            {regionalRank && (
              <div className="mt-1 text-body-xs tabular-nums text-muted">{regionalRank}</div>
            )}
            <div className="mt-1 text-body-xs text-muted">
              {interpretationLabel(metric.interpretation)}
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-error">{error}</div>
      ) : !detail ? (
        <div className="rounded-lg border border-card-border bg-card p-6 text-muted">
          Loading metric history...
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-card-border bg-card p-4 shadow-card">
              <h3 className="font-mono text-body-xs uppercase tracking-widest text-muted">
                Historical series
              </h3>
              {detail.historyNotice && (
                <p className="mb-2 text-body-xs text-muted">{detail.historyNotice}</p>
              )}
              <ResetMetricHistoryChart
                countryId={board.countryId}
                metric={metric}
                history={detail.history}
              />
            </div>
            {board.scope === "national" && (
              <div className="rounded-lg border border-card-border bg-card p-4 shadow-card">
                <h3 className="font-mono text-body-xs uppercase tracking-widest text-muted">
                  Regional breakdown
                </h3>
                {detail.regions.length === 0 ? (
                  <p className="mt-3 text-body-sm italic text-muted">
                    This is a national observation and has no regional owner series.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-card-border">
                    {detail.regions.map((region) => {
                      const row = {
                        ...metric,
                        observation: { ...metric.observation, value: region.value },
                      };
                      return (
                        <div
                          key={region.regionId}
                          className="flex items-center justify-between gap-4 py-2 text-body-sm"
                        >
                          <span className="text-foreground">{region.name}</span>
                          <span className="text-right tabular-nums text-foreground">
                            {valueLabel(row, board.countryId)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <aside className="flex flex-col gap-4">
            <div className="rounded-lg border border-card-border bg-card p-4 text-body-xs">
              <p>
                Condition score:{" "}
                {metric.conditionScore === null
                  ? "Not scored"
                  : `${metric.conditionScore.toFixed(1)} / 100`}
                . Higher is better. This game-calibrated score differs from the raw value. Domain
                scores average their scored metrics; the overall score averages all scored metrics,
                so domains with more metrics carry more weight.
              </p>
              {metric.policyPressure && <PolicyPressureSummary pressure={metric.policyPressure} />}
            </div>
            <div className="rounded-lg border border-card-border bg-card p-4 shadow-card">
              <h3 className="font-mono text-body-xs uppercase tracking-widest text-muted">
                How this measure works
              </h3>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-body-xs">
                <dt className="text-muted">Responsible system</dt>
                <dd className="text-foreground">{metricOwnerLabel(metric.owner)}</dd>
                <dt className="text-muted">Data basis</dt>
                <dd className="text-foreground">
                  {metricDataBasis(
                    metric.observation.status,
                    metric.observation.source.includes("national rollup")
                  )}
                </dd>
                <dt className="text-muted">Updated</dt>
                <dd className="text-foreground">{metricRefreshLabel(metric.refresh)}</dd>
                <dt className="text-muted">Latest publication</dt>
                <dd className="text-foreground">
                  {metricFreshnessLabel(
                    metric.observation.observedAtTurn ?? metric.observation.lastUpdatedTurn,
                    metric.observation.source.includes("national rollup"),
                    metric.refresh
                  )}
                </dd>
                <dt className="text-muted">National figure</dt>
                <dd className="text-foreground">
                  {metric.observation.status === "proxy" &&
                  metric.observation.source.includes("rollup")
                    ? "Provisional regional aggregation. The data note states the actual basis; owner-specific national weights may be unavailable."
                    : metricAggregationLabel(metric.aggregation)}
                </dd>
                <dt className="text-muted">Data quality</dt>
                <dd className="text-foreground">{metricQualityLabel(metric.observation.status)}</dd>
              </dl>
              <p className="mt-3 border-t border-card-border pt-3 text-body-xs leading-relaxed text-muted">
                {metricQualityExplanation(metric.observation.status)}
              </p>
            </div>
            <div className="rounded-lg border border-card-border bg-card p-4 shadow-card">
              <h3 className="font-mono text-body-xs uppercase tracking-widest text-muted">
                Policy environment
              </h3>
              <div className="mt-3 flex flex-col gap-2">
                {metric.standingLaws.map((law) => (
                  <StandingLawDetail
                    key={law.familyId}
                    law={law}
                    interpretation={metric.interpretation}
                    asOfTurn={board.asOfTurn}
                  />
                ))}
                {metric.temporaryActionEffect && (
                  <EffectDetail
                    label="Temporary Cabinet effect"
                    points={metric.temporaryActionEffect.favorableNormalizedPoints}
                    sources={metric.temporaryActionEffect.contributingActions}
                  />
                )}
                {metric.legislativeEffect && (
                  <EffectDetail
                    label="Law change from opening"
                    points={metric.legislativeEffect.favorableNormalizedPoints}
                    sources={metric.legislativeEffect.contributingPrograms}
                  />
                )}
                {metric.standingLaws.length === 0 &&
                  !metric.temporaryActionEffect &&
                  !metric.legislativeEffect && (
                    <p className="text-body-sm italic text-muted">
                      No law family or Cabinet action currently targets this metric. Its responsible
                      system still owns the observed value.
                    </p>
                  )}
              </div>
            </div>
            <div className="rounded-lg border border-card-border bg-card p-4 shadow-card">
              <h3 className="font-mono text-body-xs uppercase tracking-widest text-muted">
                Related metrics
              </h3>
              <div className="mt-3 flex flex-col gap-2">
                {related.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.id}
                    onClick={() => onOpenMetric(candidate)}
                    className="text-left text-body-sm text-foreground hover:text-primary"
                  >
                    {candidate.name} →
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
