/** Offline cohort sensitivity replay. Input/output snapshots stay outside the repository. */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { advanceCohort } from "../../src/lib/demographics/cohortFlows";
import { totalPopulation } from "../../src/lib/demographics/cohortVector";
import { fertilityPolicyIndex } from "../../src/lib/resetMetrics/rules/fertilityPolicy";
import { birthRateIndexToTFR } from "../../src/lib/demographics/flows/fertility";
import {
  labourMigrationPct,
  migrantAgeSexProfile,
} from "../../src/lib/demographics/flows/internationalMigration";
import {
  applyInternalMigration,
  computeInternalNetTargets,
  regionAttractiveness,
} from "../../src/lib/demographics/flows/internalMigration";
import { TURNS_PER_YEAR } from "../../src/lib/constants/turnTime";

const cells = z.array(z.number().finite().nonnegative()).length(101);
const inputSchema = z.object({
  turn: z.number().int().positive(),
  observedMigrationPct: z.number().finite(),
  regions: z
    .array(
      z.object({
        id: z.string(),
        ages: z.object({ male: cells, female: cells }),
        mortalityRates: z.object({ male: cells, female: cells }),
        openingIndex: z.number().min(0).max(100),
        priorIndex: z.number().min(0).max(100),
        currentPressure: z.number().finite(),
        laggedPressure: z.number().finite(),
        tightness: z.number().nonnegative(),
        wageIndex: z.number().positive(),
        attractiveness: z.object({
          gdpGrowth: z.number().finite(),
          unemployment: z.number().finite(),
          medianIncome: z.number().finite(),
          costOfLiving: z.number().finite(),
          labourTightness: z.number().finite(),
          labourWageIndex: z.number().finite(),
        }),
      })
    )
    .min(1),
});
export type DemographicReceiptInput = z.infer<typeof inputSchema>;

/** Conditional sensitivities, not a full-world economic forecast or a replacement migration rule. */
export function simulateReceiptTiming(raw: DemographicReceiptInput, years = 10) {
  const input = inputSchema.parse(raw);
  if (!Number.isInteger(years) || years < 1 || years > 50) throw Error("Invalid horizon");
  if (new Set(input.regions.map((r) => r.id)).size !== input.regions.length)
    throw Error("Duplicate region");
  if (
    input.regions.some((r) =>
      [...r.mortalityRates.male, ...r.mortalityRates.female].some((q) => q > 1)
    )
  )
    throw Error("Invalid mortality rates");
  const averageIncome =
    input.regions.reduce((n, r) => n + r.attractiveness.medianIncome, 0) / input.regions.length;
  const attraction = new Map(
    input.regions.map((r) => [r.id, regionAttractiveness(r.attractiveness, averageIncome)])
  );
  const scenarios = [
    { name: "previous-receipt timing", fixed: false, migration: input.observedMigrationPct },
    {
      name: "fixed timing, observed migration",
      fixed: true,
      migration: input.observedMigrationPct,
    },
    { name: "fixed timing, no net migration", fixed: true, migration: 0 },
    { name: "fixed timing, 0.3% net migration", fixed: true, migration: 0.3 },
    { name: "fixed timing, 0.5% net migration", fixed: true, migration: 0.5 },
  ];
  return {
    sourceTurn: input.turn,
    turnsPerYear: TURNS_PER_YEAR,
    years,
    assumptions: [
      "Current funded policy pressures, mortality rates and regional economic attractiveness held fixed.",
      "Existing continuous aging, mortality, fertility, migrant age profile and internal migration rules reused.",
      "Net international migration is an explicit national sensitivity, distributed by regional population.",
      "Migration scenarios are not forecasts of admissions or world-cap allocation. No future births or cash are written.",
      "No endogenous labour, fiscal, housing, war, conscription or economic feedback; sustained funding is assumed.",
    ],
    labourVisaSensitivity: input.regions.map((r) => ({
      region: r.id,
      tightness: r.tightness,
      // Hypothetical positive baseline isolates the work-visa schedule. Closed or
      // emigrating regions can be less accessible under the current center law.
      centerPct: labourMigrationPct("center", r.tightness, r.wageIndex, 0.1),
      centerLeftPct: labourMigrationPct("center_left", r.tightness, r.wageIndex, 0.1),
      farLeftPct: labourMigrationPct("far_left", r.tightness, r.wageIndex, 0.1),
    })),
    scenarios: scenarios.map((scenario) => {
      let regions = input.regions.map((r) => ({
        ...r,
        ages: structuredClone(r.ages),
        index: r.priorIndex,
      }));
      const population = () => regions.reduce((n, r) => n + totalPopulation(r.ages), 0);
      const startPopulation = population();
      let previousYearPopulation = startPopulation;
      const annual = [];
      for (let t = 1; t <= years * TURNS_PER_YEAR; t++) {
        const beforeTurn = population();
        let births = 0,
          deaths = 0,
          migrants = 0;
        for (const r of regions) {
          r.index = fertilityPolicyIndex(
            r.openingIndex,
            r.index,
            scenario.fixed ? r.currentPressure : r.laggedPressure
          );
          const net = (totalPopulation(r.ages) * scenario.migration) / (100 * TURNS_PER_YEAR);
          const result = advanceCohort(
            r.ages,
            {
              replacementTFR: 2.06,
              birthRateIndex: r.index,
              mortalityRates: r.mortalityRates,
              healthcare: { lifeExpectancy: 80, preventableMortality: 0 },
              netInternationalMigrants: net,
              migrantShareMale: 0.5,
            },
            input.turn + t,
            TURNS_PER_YEAR
          );
          r.ages = result.vector;
          births += result.flows.births;
          deaths += result.flows.deaths;
          migrants += result.flows.netMigration;
        }
        const beforeInternal = population();
        const populations = new Map(regions.map((r) => [r.id, totalPopulation(r.ages)]));
        const targets = computeInternalNetTargets(attraction, populations, TURNS_PER_YEAR);
        const internal = applyInternalMigration(
          new Map(regions.map((r) => [r.id, r.ages])),
          targets,
          migrantAgeSexProfile(0.5),
          0.05
        );
        regions = regions.map((r) => ({ ...r, ages: internal.vectors.get(r.id)! }));
        if (Math.abs(population() - beforeInternal) > 0.01)
          throw Error("Internal migration lost people");
        if (t % TURNS_PER_YEAR === 0) {
          const pop = population();
          annual.push({
            year: t / TURNS_PER_YEAR,
            population: Math.round(pop),
            yearGrowthPct: (pop / previousYearPopulation - 1) * 100,
            endTurnGrowthAnnualizedPct:
              (((births - deaths + migrants) * TURNS_PER_YEAR) / beforeTurn) * 100,
            fertilityMin: Math.min(...regions.map((r) => birthRateIndexToTFR(r.index, 2.06))),
            fertilityMax: Math.max(...regions.map((r) => birthRateIndexToTFR(r.index, 2.06))),
          });
          previousYearPopulation = pop;
        }
      }
      return {
        name: scenario.name,
        migrationPct: scenario.migration,
        startPopulation: Math.round(startPopulation),
        changePct: (population() / startPopulation - 1) * 100,
        firstPositiveYear: annual.find((r) => r.yearGrowthPct > 0)?.year ?? null,
        annual,
      };
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, years = "10"] = process.argv.slice(2);
  if (!input || !output) throw Error("Supply external input.json and output.json paths");
  const result = simulateReceiptTiming(JSON.parse(readFileSync(input, "utf8")), Number(years));
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}
