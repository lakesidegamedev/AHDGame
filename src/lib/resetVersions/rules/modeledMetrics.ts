import { primaryMetrics } from "@/lib/resetMetrics/catalog";
import {
  buildOpeningMetricObservation,
  type OpeningMetricObservation,
} from "@/lib/resetMetrics/rules/openingObservation";
import { provisionalRegionalOpening } from "@/lib/resetMetrics/rules/provisionalOpening";
import type { ModeledOpeningCountry as OpeningCountry } from "../rules";
import {
  buildResetMetricSnapshot,
  type ResetMetricSnapshot,
} from "@/lib/resetMetrics/rules/snapshot";
import { openingDependencyCohorts } from "@/lib/resetMetrics/rules/cohortOpening";
import { birthRateIndexToTFR } from "@/lib/demographics/flows/fertility";
import type { AgeSexVector } from "@/lib/demographics/cohortVector";
import { periodLifeExpectancy } from "@/lib/resetMetrics/rules/periodLifeExpectancy";

export interface ModeledMetricRegion {
  id: string;
  country: OpeningCountry;
  population: number;
  values: Record<string, number>;
  ages: AgeSexVector;
}

export function buildModeledMetricOpening(input: {
  worldId: string;
  turn: number;
  preset: string;
  year: number;
  fiscalYears: Readonly<Partial<Record<OpeningCountry, number>>>;
  regions: readonly ModeledMetricRegion[];
  national: Readonly<Partial<Record<OpeningCountry, Record<string, OpeningMetricObservation>>>>;
}): ResetMetricSnapshot[] {
  const output: ResetMetricSnapshot[] = [];
  for (const country of Object.keys(input.national) as OpeningCountry[]) {
    const regions = input.regions.filter((r) => r.country === country);
    const population = regions.reduce((sum, r) => sum + r.population, 0);
    if (!regions.length || population <= 0)
      throw new Error(`Missing modeled regions for ${country}`);
    const average = (path: string) =>
      regions.reduce((sum, r) => sum + r.values[path]! * r.population, 0) / population;
    const proxy = provisionalRegionalOpening(
      country,
      regions.map((r) => ({
        regionId: r.id,
        population: r.population,
        medianIncome: r.values["economic.medianIncome"] ?? null,
        costOfLiving: r.values["economic.costOfLiving"] ?? null,
        rdIntensity: r.values["economic.rdIntensity"] ?? null,
        workforceSkill: r.values["education.workforceSkill"] ?? null,
        universityEnrollment: r.values["education.universityEnrollment"] ?? null,
        uninsuredRate: r.values["healthcare.uninsuredRate"] ?? null,
        physicianRate: r.values["healthcare.physicianRate"] ?? null,
        publicHealthPreparedness: r.values["healthcare.publicHealthPreparedness"] ?? null,
        lifeExpectancy: r.values["healthcare.lifeExpectancy"] ?? null,
        housingAffordability: r.values["social.housingAffordability"] ?? null,
        publicTrust: r.values["governance.publicTrust"] ?? null,
        populationGrowth: r.values["population.populationGrowth"] ?? null,
      })),
      {
        lifeYears: average("healthcare.lifeExpectancy"),
        growthPercent: average("population.populationGrowth"),
      },
      input.preset
    );
    const testedReference = average("education.testPerformance");
    const boards = [
      buildResetMetricSnapshot({
        worldId: input.worldId,
        countryId: country,
        sourceTurn: input.turn,
        observations: input.national[country]!,
      }),
    ];
    for (const region of regions) {
      const value = (path: string) => region.values[path] ?? null;
      const cohort = openingDependencyCohorts(region.ages);
      const observations = Object.fromEntries(
        primaryMetrics
          .filter((m) => m.aggregation !== "national")
          .map((metric) => {
            const observation = buildOpeningMetricObservation(metric.id, {
              legacyValue: value(metric.path),
              ownerValue:
                metric.id === "55"
                  ? birthRateIndexToTFR(value("population.birthRate") ?? NaN, 2.06)
                  : null,
              testedCohortScore: value("education.testPerformance"),
              testedCohortReference: testedReference,
              legacyTreatmentDelayIndex:
                value("healthcare.nhsWaitingTime") ?? value("healthcare.hseWaitingListMonths"),
              totalCrimeRate: value("publicSafety.crimeRate"),
              violentCrimeRate: value("publicSafety.violentCrimeRate"),
              offenseUniverseReconciled: true,
              ...cohort,
            });
            const result =
              observation.value === null
                ? (proxy.get(region.id)?.[metric.id] ?? observation)
                : observation;
            if (result.value === null || !Number.isFinite(result.value))
              throw new Error(
                `Missing ${input.preset} metric ${country}:${region.id}:${metric.id}`
              );
            return [
              metric.id,
              {
                ...result,
                status: "proxy" as const,
                source: `Modeled opening from ${input.preset} game seed`,
                note: `Game-seed baseline, including inherited inputs. ${result.note.replaceAll("1991", input.preset)}`,
                lastUpdatedTurn: input.turn,
              },
            ];
          })
      );
      boards.push(
        buildResetMetricSnapshot({
          worldId: input.worldId,
          countryId: country,
          regionId: region.id,
          sourceTurn: input.turn,
          observations,
        })
      );
    }
    for (const board of boards) {
      board.openingValues = Object.fromEntries(
        Object.entries(board.observations).map(([id, o]) => [id, o.value!])
      );
      const region = regions.find((r) => r.id === board.regionId);
      board.modeledOpening = {
        preset: input.preset,
        year: input.year,
        sourceFiscalYear: input.fiscalYears[country],
        ...(region
          ? {
              birthRateIndex: region.values["population.birthRate"],
              migrationRate: region.values["population.migrationRate"],
              life: {
                openingYears: board.openingValues["20"]!,
                modeledYears: periodLifeExpectancy({
                  lifeExpectancy: board.openingValues["20"]!,
                  preventableMortality: board.openingValues["19"]!,
                }),
              },
            }
          : {}),
      };
      output.push(board);
    }
  }
  return output;
}
