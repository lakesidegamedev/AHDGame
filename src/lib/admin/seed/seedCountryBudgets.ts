/**
 * Country budget setup. seedCountryBudgets restores national and regional budgets,
 * default enacted laws, and country-owned corporations from the selected preset.
 * Country-specific reset filters and seed steps retain their original ordering.
 */
import type { Db } from "mongodb";
import type { CorporateSector, State } from "@/lib/db/types";
import type { EnactedLaw, StateBudget } from "@/lib/db/types/budget";
import type { CountryId } from "@/lib/constants/countries";
import type { generateStateBudgets } from "@/lib/seeds/reference/budgets";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { statesCollection } from "@/lib/db/repositories/states";
import type { Document } from "mongodb";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

interface CountryBudgetSeedOptions {
  countryId: CountryId;
  fiscalYearFallback: number;
  skipWithoutNationalBudget?: boolean;
  regionalResetIncludesCountry?: boolean;
  legacyRegionalBudgetIds?: string[];
  afterNationalBudget?: () => Promise<void>;
  seedCorporations?: (states: Parameters<typeof generateStateBudgets>[0]) => Promise<void>;
  corporationLabel?: string;
}

export async function seedCountryBudgets(
  db: Db,
  reset: boolean,
  log: (message: string) => void,
  preset: string,
  {
    countryId,
    fiscalYearFallback,
    skipWithoutNationalBudget = false,
    regionalResetIncludesCountry = true,
    legacyRegionalBudgetIds,
    afterNationalBudget,
    seedCorporations,
    corporationLabel = "sovereign issuer",
  }: CountryBudgetSeedOptions
): Promise<void> {
  if (reset) {
    await federalBudgetCollection(db).deleteMany({ countryId });
    const stateIds = (
      await statesCollection<Document>(db).find({ countryId }).project({ _id: 1 }).toArray()
    ).map((state) => state._id as string);
    if (stateIds.length > 0) {
      await db.collection<StateBudget>("stateBudgets").deleteMany({
        stateId: { $in: stateIds },
        ...(regionalResetIncludesCountry ? { countryId } : {}),
      });
      if (legacyRegionalBudgetIds) {
        await db.collection<StateBudget>("stateBudgets").deleteMany({
          _id: { $in: legacyRegionalBudgetIds } as never,
        });
      }
    }
    await db.collection<EnactedLaw>("enactedLaws").deleteMany({ countryId });
    log(`Reset: deleted ${countryId} budget data`);
  }

  const {
    getInitialNationalBudgetsForPreset,
    getNationalBudgetSeedConfigsForPreset,
    generateCountryOwnedSeedData,
    generateStateBudgets,
    generateDefaultEnactedLaws,
  } = await import("@/lib/seeds/reference/budgets");

  const presetBudgets = getInitialNationalBudgetsForPreset(preset);
  const fiscalYear =
    getNationalBudgetSeedConfigsForPreset(preset).find((config) => config.countryId === countryId)
      ?.fiscalYear ?? fiscalYearFallback;
  const nationalBudget = presetBudgets.find((budget) => budget.countryId === countryId);
  if (!nationalBudget && skipWithoutNationalBudget) {
    log(`[${countryId}] no national budget config for preset ${preset} — skipping`);
    return;
  }
  if (nationalBudget) {
    const { _id, ...budgetData } = nationalBudget;
    await federalBudgetCollection(db).updateOne(
      { _id },
      { $set: { ...budgetData, updatedAt: new Date() } },
      { upsert: true }
    );
    log(`Seeded 1 ${countryId} national budget`);
  }

  if (afterNationalBudget) await afterNationalBudget();

  const enactedLaws = generateDefaultEnactedLaws(preset).filter(
    (law) => law.countryId === countryId
  );
  for (const law of enactedLaws) {
    const { _id, ...lawWithoutId } = law;
    const unsetFields: Record<string, ""> = {};
    if (law.gdpPerCapitaMultiplier === undefined) unsetFields.gdpPerCapitaMultiplier = "";
    if (law.annualCostPerCapita === undefined) unsetFields.annualCostPerCapita = "";
    if (law.annualCostUsd === undefined) unsetFields.annualCostUsd = "";
    if (law.gdpCostFraction === undefined) unsetFields.gdpCostFraction = "";
    if (law.incomeCostFraction === undefined) unsetFields.incomeCostFraction = "";
    const update: Record<string, unknown> = { $set: lawWithoutId, $setOnInsert: { _id } };
    if (Object.keys(unsetFields).length > 0) update.$unset = unsetFields;
    await db.collection<EnactedLaw>("enactedLaws").updateOne(
      {
        legislationTypeId: law.legislationTypeId,
        scope: law.scope,
        countryId: law.countryId,
        repealedAt: { $exists: false },
      },
      update,
      { upsert: true }
    );
  }
  log(`Seeded ${enactedLaws.length} ${countryId} default enacted laws`);

  const states = await statesCollection(db).find({ countryId }).toArray();
  const statesForBudgets = states.map((state) => ({
    id: state._id,
    population: state.population,
    gdp: state.gdp,
    countryId: state.countryId,
  }));
  const stateBudgets = generateStateBudgets(statesForBudgets, fiscalYear);
  for (const budget of stateBudgets) {
    const { _id, ...budgetData } = budget;
    await db
      .collection<StateBudget>("stateBudgets")
      .updateOne({ _id }, { $set: budgetData }, { upsert: true });
  }
  log(`Seeded ${stateBudgets.length} ${countryId} regional budgets`);

  if (seedCorporations) {
    await seedCorporations(statesForBudgets);
    return;
  }
  const corpData = generateCountryOwnedSeedData(statesForBudgets, preset).filter(
    (entry) => entry.corporation.countryOwnerId === countryId
  );
  for (const entry of corpData) {
    const { _id: corpId, ...corporation } = entry.corporation;
    await corporationsCollection(db).updateOne(
      { _id: corpId },
      { $set: corporation },
      { upsert: true }
    );
    for (const sector of entry.sectors) {
      const { _id: _sectorId, ...sectorData } = sector;
      await corporateSectorsCollection(db).updateOne(
        { corporationId: corpId, stateId: sector.stateId, sectorType: sector.sectorType },
        { $set: sectorData },
        { upsert: true }
      );
    }
  }
  if (corpData.length > 0)
    log(`Seeded ${corpData.length} ${countryId} ${corporationLabel} setup(s)`);
}
