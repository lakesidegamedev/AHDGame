import { logger } from "@/lib/observability/logger";
/** Seed modeled v2 openings from the selected world's authored inputs and seeded stocks. */
import type { Db } from "mongodb";
import type { State } from "@/lib/db/types/state";
import type { FederalBudget, StateBudget, EnactedLaw } from "@/lib/db/types/budget";
import type { RegionDemographics } from "@/lib/db/types/regionDemographics";
import type { MacroMetricsDoc } from "@/lib/db/types/macroMetrics";
import type { MilitaryUnit } from "@/lib/db/types/militaryUnit";
import { resolveResetStartDate, type ResetStartDate } from "@/lib/admin/resetStartDate";
import { calculateEnactedLawAnnualCost } from "@/lib/budget/costs";
import { fiscalOwnerReadings } from "@/lib/resetMetrics/rules/fiscalOwner";
import { buildOpeningMetricObservation } from "@/lib/resetMetrics/rules/openingObservation";
import { nationalForceReadiness } from "@/lib/resetMetrics/rules/forceReadiness";
import { auditOpeningNationalMetricSources1991 } from "@/lib/resetMetrics/openingSeed1991";
import { openingLawReferences } from "@/lib/resetLegislation/openingLaw";
import { DEPARTMENT_DEFINITIONS } from "@/lib/governmentFinance/departmentCatalog";
import { buildOpeningDepartmentFundingPartition } from "@/lib/resetFinance/rules/liveDepartmentAccount";
import { persistMetricOpening } from "@/lib/resetMetrics/seedOpening1991";
import { persistLawOpening } from "@/lib/resetLegislation/seedOpening1991";
import { persistCabinetOpening } from "@/lib/resetFinance/seedOpeningDepartments1991";
import { RESET_V2_OPENING_COUNTRIES, type ResetSystem } from "./rules";
import { buildModeledMetricOpening } from "./rules/modeledMetrics";
import { buildModeledFiscalOpening } from "./rules/modeledFinance";
import { modeledSeedMetrics, metricNumbers, modeledCensusGaps } from "./modeledSeedInputs";
import { getNationalBudgetSeedProvenance } from "@/lib/seeds/reference/budgets";
import { getLaw } from "@/lib/politicalLegislation/catalog";
import { modeledLawFamily } from "./rules/modeledLawFamily";

export async function loadModeledOpening(
  db: Db,
  preset: string,
  worldId: string,
  turn: number,
  date?: ResetStartDate
) {
  const unsupportedCountries = RESET_V2_OPENING_COUNTRIES.flatMap((country) => {
    const regions = modeledCensusGaps(preset, country);
    return regions.length
      ? [
          {
            country,
            regions,
            reason: `No authored ${preset} cohort census; v2 opening unsupported, legacy systems retained`,
          },
        ]
      : [];
  });
  const countries = RESET_V2_OPENING_COUNTRIES.filter(
    (country) => !unsupportedCountries.some((row) => row.country === country)
  );
  const filter = { countryId: { $in: [...countries] } };
  const [states, budgets, regionalBudgets, macro, demographics, laws, units] = await Promise.all([
    statesCollection<State>(db)
      .find(filter, { projection: { _id: 1, countryId: 1, population: 1, gdp: 1 } })
      .toArray(),
    federalBudgetCollection<FederalBudget>(db).find(filter).toArray(),
    stateBudgetsCollection<StateBudget>(db)
      .find(filter, { projection: { stateId: 1, countryId: 1, spending: 1 } })
      .toArray(),
    macroMetricsCollection<MacroMetricsDoc>(db)
      .find(filter, { projection: { _id: 1, countryId: 1, economic: 1, population: 1 } })
      .toArray(),
    regionDemographicsCollection<RegionDemographics>(db)
      .find(filter, { projection: { _id: 1, countryId: 1, ages: 1 } })
      .toArray(),
    enactedLawsCollection<EnactedLaw>(db)
      .find({ ...filter, repealedAt: { $exists: false }, scope: "national" })
      .toArray(),
    militaryUnitsCollection<MilitaryUnit>(db)
      .find(filter, {
        projection: {
          countryId: 1,
          basePower: 1,
          readiness: 1,
          supply: 1,
          integrity: 1,
          readyAtTurn: 1,
        },
      })
      .toArray(),
  ]);
  const year = resolveResetStartDate(preset, date).year;
  const macroById = new Map(macro.map((r) => [`${r.countryId}:${r._id}`, r]));
  const agesById = new Map(demographics.map((r) => [`${r.countryId}:${r._id}`, r.ages]));
  const regions = countries.flatMap((country) => {
    const authored = new Map(modeledSeedMetrics(preset, country).map((r) => [String(r._id), r]));
    return states
      .filter((s) => s.countryId === country)
      .map((s) => {
        const key = `${country}:${s._id}`;
        const source = authored.get(s._id);
        const ages = agesById.get(key);
        if (!source || !ages) throw new Error(`Missing ${preset} modeled seed input ${key}`);
        return {
          id: s._id,
          country,
          population: s.population,
          ages,
          values: {
            ...metricNumbers(source),
            ...metricNumbers(macroById.get(key) ?? {}),
          },
        };
      });
  });
  const legacyEnergy = auditOpeningNationalMetricSources1991();
  const national = Object.fromEntries(
    countries.map((country) => {
      const budget = budgets.find((b) => b.countryId === country);
      if (!budget) throw new Error(`Missing modeled budget ${country}`);
      const fiscal = fiscalOwnerReadings({
        gdp: budget.gdp,
        revenue: budget.revenue.total,
        spending: budget.spending.total,
        debtPrincipal: budget.debt.principal,
        inflationRate: budget.economicFactors.inflationRate,
      });
      return [
        country,
        {
          "07": buildOpeningMetricObservation("07", {
            annualCpiChange: fiscal.priceChange,
            cpiVolatility48: 0,
          }),
          "09": buildOpeningMetricObservation("09", { ownerValue: fiscal.balanceToGdp }),
          "10": buildOpeningMetricObservation("10", { ownerValue: fiscal.debtToGdp }),
          "57": buildOpeningMetricObservation("57", {
            ownerValue: nationalForceReadiness(
              units.filter((u) => u.countryId === country),
              turn,
              true
            ),
          }),
          "58": {
            ...legacyEnergy[country]["58"]!,
            source: `Modeled ${preset} opening using the existing game fuel-risk assumption`,
            note: "Inherited provisional fuel-risk parameters. The seed supplies no preset-specific physical fuel ledger.",
          },
        },
      ];
    })
  );
  const fiscalYears = Object.fromEntries(
    getNationalBudgetSeedProvenance(preset).map((row) => [row.countryId, row.sourceFiscalYear])
  );
  const metrics = buildModeledMetricOpening({
    worldId,
    turn,
    preset,
    year,
    regions,
    national,
    fiscalYears,
  });
  const fiscal = buildModeledFiscalOpening({
    worldId,
    turn,
    preset,
    year,
    references: openingLawReferences,
    countries: countries.map((country) => {
      const budget = budgets.find((b) => b.countryId === country)!;
      const population = regions
        .filter((r) => r.country === country)
        .reduce((sum, r) => sum + r.population, 0);
      return {
        country,
        operating: Math.round(budget.spending.total - budget.spending.debtInterest),
        grants: Math.round(budget.spending.stateGrants),
        sources: laws
          .filter((l) => l.countryId === country)
          .map((law) => ({
            id: law.legislationTypeId,
            familyId: (() => {
              const source = getLaw(law.legislationTypeId);
              return source ? modeledLawFamily(source) : undefined;
            })(),
            title: law.title,
            optionIndex: law.policyOptionIndex ?? -1,
            grant: law.isGrant === true,
            annualCost: calculateEnactedLawAnnualCost(law, {
              gdp: budget.gdp,
              population,
              countryId: country,
              budgetCapacity: budget.revenue.total,
              year,
              v2Base: { gdp: budget.gdp, population },
            }),
          })),
        regions: states
          .filter((s) => s.countryId === country)
          .map((s) => {
            const regional = regionalBudgets.find(
              (b) => b.countryId === country && b.stateId === s._id
            );
            if (!regional) throw new Error(`Missing modeled regional budget ${country}:${s._id}`);
            return {
              id: s._id,
              spending: regional.spending.total,
              spendingByCategory: regional.spending.byCategory,
            };
          }),
      };
    }),
  });
  const grants = Object.fromEntries(
    budgets.map((b) => [b.countryId, Math.round(b.spending.stateGrants)])
  );
  const partition = buildOpeningDepartmentFundingPartition(
    fiscal.departments,
    DEPARTMENT_DEFINITIONS,
    grants,
    {},
    year
  );
  const books = Object.fromEntries(
    budgets.map((b) => [b.countryId, { debt: b.debt.principal, debtCeiling: b.debt.ceiling }])
  );
  return { countries, unsupportedCountries, metrics, fiscal, partition, books };
}

export async function seedModeledOpening(
  db: Db,
  preset: string,
  worldId: string,
  turn: number,
  system: ResetSystem,
  date?: ResetStartDate
) {
  const opening = await loadModeledOpening(db, preset, worldId, turn, date);
  for (const row of opening.unsupportedCountries)
    logger.warn("modeled-opening", row.reason, { country: row.country });
  if (system === "metrics")
    return persistMetricOpening(db, worldId, turn, opening.countries, opening.metrics);
  if (system === "legislation")
    return persistLawOpening(
      db,
      worldId,
      turn,
      opening.countries,
      opening.fiscal.laws,
      opening.fiscal.regional
    );
  if (system === "cabinet")
    return persistCabinetOpening(
      db,
      worldId,
      turn,
      opening.countries,
      opening.fiscal.departments,
      opening.partition,
      opening.books
    );
  throw new Error("Demographics openings use their seeded live vectors");
}

import { statesCollection } from "@/lib/db/repositories/states";

import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";

import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";

import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";

import { regionDemographicsCollection } from "@/lib/db/repositories/regionDemographics";

import { enactedLawsCollection } from "@/lib/db/repositories/enactedLaws";

import { militaryUnitsCollection } from "@/lib/db/repositories/militaryUnits";
