import { primaryMetrics } from "../catalog";
import type { OpeningMetricObservation, ObservationStatus } from "./openingObservation";
import type { ResetMetricHistoryPoint } from "./history";
import { demographicRates } from "./demographicMeasurement";
import { householdDistributionRollup } from "./householdDistribution";
import { regionalCoverageKey } from "./householdPublication";

export interface NationalMetricRegionReading {
  regionId: string;
  population: number;
  workingAgePopulation?: number;
  votingEligiblePopulation?: number;
  gdp?: number;
  observations: Readonly<Record<string, OpeningMetricObservation>>;
}

type WeightKind = "population" | "working-age population" | "eligible population" | "GDP";

const GDP_WEIGHTED_IDS = new Set(["05", "06", "08", "15"]);
const WORKING_AGE_WEIGHTED_IDS = new Set(["01", "13"]);
const ELIGIBLE_WEIGHTED_IDS = new Set(["51"]);

export function preferredNationalMetricWeight(
  metricId: string,
  region: NationalMetricRegionReading
): { value: number; kind: WeightKind; fallback: boolean } {
  const preferred = GDP_WEIGHTED_IDS.has(metricId)
    ? { value: region.gdp, kind: "GDP" as const }
    : WORKING_AGE_WEIGHTED_IDS.has(metricId)
      ? { value: region.workingAgePopulation, kind: "working-age population" as const }
      : ELIGIBLE_WEIGHTED_IDS.has(metricId)
        ? { value: region.votingEligiblePopulation, kind: "eligible population" as const }
        : { value: region.population, kind: "population" as const };
  if (
    typeof preferred.value === "number" &&
    Number.isFinite(preferred.value) &&
    preferred.value > 0
  ) {
    return { value: preferred.value, kind: preferred.kind, fallback: false };
  }
  if (!Number.isFinite(region.population) || region.population <= 0) {
    throw new Error(`National metric rollup has no usable weight for ${region.regionId}`);
  }
  return { value: region.population, kind: "population", fallback: true };
}

function rollupStatus(
  observations: readonly OpeningMetricObservation[],
  aggregation: string,
  fallback: boolean
): ObservationStatus {
  if (fallback || observations.some((observation) => observation.status === "proxy")) {
    return "proxy";
  }
  // A weighted mean is the approved read model for population-weighted
  // measures. Other catalog methods ultimately need their owner-specific
  // national numerator, denominator, asset, area, or hazard stock.
  return aggregation === "population_weighted" ? "derived" : "proxy";
}

/** Only same-observation counts can make a national ratio exact. */
function ownerRatio(
  metricId: string,
  observations: readonly OpeningMetricObservation[],
  regionIds?: readonly string[]
): number | null {
  if (!observations.length) return null;
  if (observations.some((o) => o?.definitionVersion === 2)) {
    const first = observations[0]!;
    const basis = first.countryBasis;
    if (
      !regionIds ||
      !basis ||
      !first.unit ||
      !Number.isFinite(basis.value) ||
      !Number.isSafeInteger(basis.measurementTurn) ||
      basis.measurementTurn < 1 ||
      basis.coverageKey !== regionalCoverageKey(regionIds) ||
      observations.some(
        (o) =>
          o.definitionVersion !== 2 ||
          o.unit !== first.unit ||
          o.countryBasis?.countryId !== basis.countryId ||
          o.countryBasis?.coverageKey !== basis.coverageKey ||
          o.countryBasis?.measurementTurn !== basis.measurementTurn ||
          o.observedAtTurn !== basis.measurementTurn ||
          o.countryBasis?.value !== basis.value
      )
    )
      throw new Error(`National metric ${metricId} has incomplete or mixed definition coverage`);
    return basis.value;
  }
  if (["20", "55"].includes(metricId)) {
    if (
      observations.some(
        (o) =>
          !o?.demographicBasis ||
          o.demographicBasis.kind !== (metricId === "20" ? "mortality" : "fertility")
      )
    )
      return null;
    return demographicRates(observations.map((o) => o.demographicBasis!));
  }
  if (["02", "04"].includes(metricId)) {
    if (observations.some((o) => !o?.householdBasis)) return null;
    if (
      observations.some(
        (o) =>
          Math.abs(
            o.value! - (metricId === "02" ? o.householdBasis!.median : o.householdBasis!.gini)
          ) > 1e-6
      )
    )
      return null;
    const result = householdDistributionRollup(observations.map((o) => o.householdBasis!));
    return result ? (metricId === "02" ? result.median : result.gini) : null;
  }
  if (!["01", "51", "54", "56"].includes(metricId)) return null;
  let numerator = 0,
    denominator = 0;
  for (const observation of observations) {
    if (!observation) return null;
    const basis = observation.ratioBasis;
    if (
      !basis ||
      !Number.isFinite(basis.numerator) ||
      (metricId !== "54" && basis.numerator < 0) ||
      !Number.isFinite(basis.denominator) ||
      basis.denominator <= 0
    )
      return null;
    if (Math.abs(observation.value! - (100 * basis.numerator) / basis.denominator) > 0.001)
      return null;
    numerator += basis.numerator;
    denominator += basis.denominator;
  }
  return (100 * numerator) / denominator;
}

/**
 * Build the national read model for region-owned primary metrics.
 *
 * This does not create a second owner or mutate a stored observation. It is a
 * portable rollup over the current regional owner readings. Where the game
 * does not persist the catalog's ideal national denominator, the result stays
 * explicitly provisional instead of presenting a weighted mean as sourced
 * national data.
 */
export function aggregateNationalMetricObservations(
  regions: readonly NationalMetricRegionReading[]
): Record<string, OpeningMetricObservation> {
  if (
    regions.length === 0 ||
    new Set(regions.map((region) => region.regionId)).size !== regions.length
  ) {
    throw new Error("National metric rollup requires distinct regional readings");
  }

  return Object.fromEntries(
    primaryMetrics
      .filter((metric) => metric.aggregation !== "national")
      .map((metric) => {
        let weightedValue = 0;
        let totalWeight = 0;
        let fallback = false;
        let kind: WeightKind | null = null;
        const observations: OpeningMetricObservation[] = [];

        for (const region of regions) {
          const observation = region.observations[metric.id];
          if (
            !observation ||
            observation.metricId !== metric.id ||
            observation.path !== metric.path ||
            observation.owner !== metric.owner ||
            typeof observation.value !== "number" ||
            !Number.isFinite(observation.value) ||
            observation.status === "unavailable"
          ) {
            throw new Error(`National metric rollup is missing ${region.regionId}/${metric.id}`);
          }
          const weight = preferredNationalMetricWeight(metric.id, region);
          kind ??= weight.kind;
          if (kind !== weight.kind) fallback = true;
          fallback ||= weight.fallback;
          weightedValue += observation.value * weight.value;
          totalWeight += weight.value;
          observations.push(observation);
        }

        if (totalWeight <= 0 || !kind) {
          throw new Error(`National metric rollup has no denominator for ${metric.id}`);
        }
        const exactRatio = ownerRatio(
          metric.id,
          observations,
          regions.map((r) => r.regionId)
        );
        const status =
          exactRatio !== null
            ? observations.some((o) => o.status === "proxy")
              ? "proxy"
              : "derived"
            : rollupStatus(observations, metric.aggregation, fallback);
        const isProvisional = status === "proxy";
        return [
          metric.id,
          {
            metricId: metric.id,
            path: metric.path,
            value: exactRatio ?? weightedValue / totalWeight,
            status,
            source:
              exactRatio !== null
                ? ["20", "55"].includes(metric.id)
                  ? "National synthetic lifetime recomputed from pooled age-specific owner flows"
                  : ["02", "04"].includes(metric.id)
                    ? "Pooled modeled household income distribution, including between-region differences"
                    : "Owner-numerator/denominator national rollup of current regional observations"
                : `${kind}-weighted national rollup of current regional v2 observations`,
            owner: metric.owner,
            ...(observations[0]!.definitionVersion === 2
              ? {
                  definitionVersion: 2 as const,
                  unit: observations[0]!.unit,
                  countryBasis: observations[0]!.countryBasis,
                  source: "National outcome calculated by the reconciled country owner",
                }
              : {}),
            ...(observations.every((o) => o.observedAtTurn !== undefined)
              ? { observedAtTurn: Math.min(...observations.map((o) => o.observedAtTurn!)) }
              : {}),
            ...(observations.every((observation) => observation.lastUpdatedTurn !== undefined)
              ? {
                  lastUpdatedTurn: Math.min(
                    ...observations.map((observation) => observation.lastUpdatedTurn!)
                  ),
                }
              : {}),
            note:
              exactRatio !== null
                ? ["20", "55"].includes(metric.id)
                  ? "Recomputed from pooled deaths/exposures or births/women at each age, not averaged regional lifetimes. These are modeled flows, not observed vital-registration statistics."
                  : ["02", "04"].includes(metric.id)
                    ? observations[0]!.definitionVersion === 2
                      ? observations[0]!.note
                      : "Discrete lognormal household model fitted to regional medians and Ginis. Population weights stand in for household counts; not a measured national income distribution."
                    : "National rate recomputed from the sum of same-observation regional counts, not a mean weighted by a different population."
                : metric.id === "03"
                  ? "Population-weighted modeled poverty estimate, not a measured count of households below an official national threshold."
                  : isProvisional
                    ? `Game-calibrated national rollup. The ${metric.aggregation} owner-specific national denominator is not yet persisted separately.`
                    : `National rollup using the catalog's ${metric.aggregation} aggregation rule.`,
          },
        ];
      })
  );
}

export function aggregateNationalMetricValue(
  metricId: string,
  regions: readonly NationalMetricRegionReading[]
): number {
  const exactRatio = ownerRatio(
    metricId,
    regions.map((r) => r.observations[metricId]!),
    regions.map((r) => r.regionId)
  );
  if (exactRatio !== null) return exactRatio;
  let weightedValue = 0;
  let totalWeight = 0;
  for (const region of regions) {
    const observation = region.observations[metricId];
    if (
      !observation ||
      typeof observation.value !== "number" ||
      !Number.isFinite(observation.value)
    ) {
      throw new Error(`National metric rollup is missing ${region.regionId}/${metricId}`);
    }
    const weight = preferredNationalMetricWeight(metricId, region).value;
    weightedValue += observation.value * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0)
    throw new Error(`National metric rollup has no denominator for ${metricId}`);
  return weightedValue / totalWeight;
}

export function aggregateNationalMetricHistory(
  metricId: string,
  regions: readonly (NationalMetricRegionReading & {
    history: Readonly<Record<string, readonly ResetMetricHistoryPoint[]>>;
  })[]
): ResetMetricHistoryPoint[] {
  if (regions.length === 0) return [];
  const turns = regions[0]!.history[metricId]?.map((point) => point.turn) ?? [];
  if (
    turns.length === 0 ||
    regions.some(
      (region) =>
        region.history[metricId]?.length !== turns.length ||
        region.history[metricId]?.some((point, index) => point.turn !== turns[index])
    )
  ) {
    throw new Error(`National metric history is not aligned for ${metricId}`);
  }
  return turns.map((turn, index) => {
    if (
      regions.some((region) => {
        const basis = region.history[metricId]![index]!.countryBasis;
        return basis && basis.measurementTurn > turn;
      })
    )
      throw new Error(`National metric history has a future measurement for ${metricId}`);
    const observations = regions.map((region) => ({
      ...region.observations[metricId]!,
      value: region.history[metricId]![index]!.value,
      ratioBasis: region.history[metricId]![index]!.ratioBasis,
      demographicBasis: region.history[metricId]![index]!.demographicBasis,
      householdBasis: region.history[metricId]![index]!.householdBasis,
      definitionVersion: region.history[metricId]![index]!.definitionVersion,
      unit: region.history[metricId]![index]!.unit,
      countryBasis: region.history[metricId]![index]!.countryBasis,
      // Historical owner results carry their own window. Today's measurement
      // date must not invalidate a valid older country-wide sample.
      observedAtTurn: region.history[metricId]![index]!.countryBasis?.measurementTurn,
    }));
    const exactRatio = ownerRatio(
      metricId,
      observations,
      regions.map((r) => r.regionId)
    );
    if (exactRatio !== null)
      return {
        turn,
        value: exactRatio,
        ...(observations[0]!.definitionVersion
          ? {
              definitionVersion: observations[0]!.definitionVersion,
              unit: observations[0]!.unit,
              countryBasis: observations[0]!.countryBasis,
            }
          : {}),
      };
    let weightedValue = 0;
    let totalWeight = 0;
    for (const region of regions) {
      const point = region.history[metricId]![index]!;
      const weight = preferredNationalMetricWeight(metricId, region).value;
      weightedValue += point.value * weight;
      totalWeight += weight;
    }
    return { turn, value: weightedValue / totalWeight };
  });
}
