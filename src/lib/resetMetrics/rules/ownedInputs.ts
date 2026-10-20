/** Published outcomes supply compatible gameplay inputs; aliases never mix units or polarity. */
import { primaryMetrics } from "../catalog";
import { resetMetricConditionScore, type ResetMetricScoreCountry } from "../conditionScore";
import type { OpeningMetricObservation } from "./openingObservation";
import {
  ADAPTER_TIER1,
  buildPoliticalBaseModifiers,
} from "@/lib/politicalLegislation/marginAdapter";
import { politicalScoreFromLegacyValue } from "@/lib/politicalMetrics/derive/legacyInversion";
import { STATE_METRIC_PER_METRIC_CAP } from "@/lib/corporations/sectorMetricMarginProfiles";
import type { PoliticalMetricId } from "@/lib/politicalMetrics/types";

export function ownedLegacyValues(
  observations: Readonly<Record<string, OpeningMetricObservation>>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const metric of primaryMetrics) {
    // V2 fertility is children per woman; the legacy birthRate path is a
    // 0-100 policy index. Do not silently reinterpret one as the other.
    if (
      metric.id === "55" ||
      (observations[metric.id]?.definitionVersion === 2 && ["02", "24"].includes(metric.id))
    )
      continue;
    const o = observations[metric.id];
    if (
      o?.path === metric.path &&
      o.value !== null &&
      Number.isFinite(o.value) &&
      o.status !== "unavailable"
    )
      out[metric.path] = o.value;
  }
  const coverage = observations["16"]?.value;
  if (typeof coverage === "number" && Number.isFinite(coverage))
    out["healthcare.uninsuredRate"] = 100 - coverage;
  const wait = observations["18"]?.value;
  if (typeof wait === "number" && Number.isFinite(wait)) out["healthcare.nhsWaitingTime"] = wait;
  const air = observations["35"]?.value;
  if (typeof air === "number" && Number.isFinite(air)) out["environment.airQuality"] = 100 - air;
  const violent = observations["31"]?.value,
    nonviolent = observations["32"]?.value;
  if (
    typeof violent === "number" &&
    typeof nonviolent === "number" &&
    Number.isFinite(violent + nonviolent)
  )
    out["publicSafety.crimeRate"] = violent + nonviolent;
  const dependency = observations["56"]?.value;
  if (typeof dependency === "number" && Number.isFinite(dependency))
    out["population.dependencyRatio"] = dependency / 100;
  const fertility = observations["55"]?.value;
  if (typeof fertility === "number" && Number.isFinite(fertility))
    out["population.totalFertilityRate"] = fertility;
  return out;
}

/** Corporate turn and quotes use the same per-signal owner values, not a shadow family. */
export function ownedPoliticalModifiers(
  prior: Record<PoliticalMetricId, number>,
  observations: Readonly<Record<string, OpeningMetricObservation>>,
  country: ResetMetricScoreCountry,
  year: number
) {
  const out = buildPoliticalBaseModifiers(ownedPoliticalValues(prior, observations, country, year));
  for (const [path, value] of Object.entries(ownedLegacyValues(observations))) {
    if (!out.has(path)) continue;
    const [category, metricId] = path.split(".");
    const score = politicalScoreFromLegacyValue(category, metricId, value, country, year);
    if (score !== null)
      out.set(path, {
        modifier: ((score - 50) / 50) * STATE_METRIC_PER_METRIC_CAP,
        rawValue: Math.round(score * 10) / 10,
      });
  }
  return out;
}

/** Closest-family consumers retain their contract, but their scores come from owned outcomes. */
export function ownedPoliticalValues(
  prior: Readonly<Record<PoliticalMetricId, number>>,
  observations: Readonly<Record<string, OpeningMetricObservation>>,
  country: ResetMetricScoreCountry,
  year: number
): Record<PoliticalMetricId, number> {
  const out = { ...prior };
  const groups = new Map<PoliticalMetricId, number[]>();
  for (const metric of primaryMetrics) {
    const family = ADAPTER_TIER1[metric.path];
    const o = observations[metric.id];
    if (!family || o?.value == null || o.status === "unavailable") continue;
    if (o.definitionVersion === 2 && ["02", "24"].includes(metric.id)) continue;
    const score = resetMetricConditionScore(metric, o.value, country, year);
    if (score === null) continue;
    const scores = groups.get(family) ?? [];
    scores.push(score);
    groups.set(family, scores);
  }
  for (const [family, scores] of groups)
    out[family] = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return out;
}
