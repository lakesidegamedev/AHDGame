import type { Db } from "mongodb";
import { logWarning } from "@/lib/utils/errorLog";
import type { CorporateSector, State } from "@/lib/db/types";
import type { EnactedLaw, StateBudget } from "@/lib/db/types/budget";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { statesCollection } from "@/lib/db/repositories/states";
import type { Document } from "mongodb";

/**
 * Seeds only UK budget data: national budget, enacted laws, regional budgets,
 * and the UK country-owned corporation (NHS). Leaves US data untouched.
 */
export async function seedUkBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    // Only delete UK-specific budget data, not US
    await federalBudgetCollection(db).deleteMany({ countryId: "UK" });
    const ukStateIds = (
      await statesCollection<Document>(db).find({ countryId: "UK" }).project({ _id: 1 }).toArray()
    ).map((s) => s._id as string);
    await db
      .collection<StateBudget>("stateBudgets")
      .deleteMany({ stateId: { $in: ukStateIds }, countryId: "UK" });
    await db.collection<EnactedLaw>("enactedLaws").deleteMany({ countryId: "UK" });
    log("Reset: deleted UK budget data");
  }

  const {
    getInitialNationalBudgetsForPreset,
    getNationalBudgetSeedConfigsForPreset,
    generateCountryOwnedSeedData,
    generateStateBudgets,
    generateDefaultEnactedLaws,
  } = await import("@/lib/seeds/reference/budgets");

  const presetBudgets = getInitialNationalBudgetsForPreset(preset);
  const ukFiscalYear =
    getNationalBudgetSeedConfigsForPreset(preset).find((c) => c.countryId === "UK")?.fiscalYear ??
    2020;

  // Seed UK national budget only
  const ukNationalBudget = presetBudgets.find((b) => b.countryId === "UK");
  if (ukNationalBudget) {
    const { _id, ...budgetData } = ukNationalBudget;
    await federalBudgetCollection(db).updateOne(
      { _id },
      { $set: { ...budgetData, updatedAt: new Date() } },
      { upsert: true }
    );
    log("Seeded 1 UK national budget");
  }

  // Seed UK default enacted laws
  const allEnactedLaws = generateDefaultEnactedLaws(preset);
  const ukEnactedLaws = allEnactedLaws.filter((law) => law.countryId === "UK");
  for (const law of ukEnactedLaws) {
    const { _id, ...lawWithoutId } = law;

    const unsetFields: Record<string, ""> = {};
    if (law.gdpPerCapitaMultiplier === undefined) unsetFields.gdpPerCapitaMultiplier = "";
    if (law.annualCostPerCapita === undefined) unsetFields.annualCostPerCapita = "";
    if (law.annualCostUsd === undefined) unsetFields.annualCostUsd = "";
    if (law.gdpCostFraction === undefined) unsetFields.gdpCostFraction = "";
    if (law.incomeCostFraction === undefined) unsetFields.incomeCostFraction = "";

    const update: Record<string, unknown> = {
      $set: lawWithoutId,
      $setOnInsert: { _id },
    };
    if (Object.keys(unsetFields).length > 0) {
      update.$unset = unsetFields;
    }

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
  log(`Seeded ${ukEnactedLaws.length} UK default enacted laws`);

  // Seed UK regional budgets
  const states = await statesCollection(db).find({ countryId: "UK" }).toArray();
  const statesForBudgets = states.map((s) => ({
    id: s._id,
    population: s.population,
    gdp: s.gdp,
    countryId: s.countryId,
  }));
  const stateBudgets = generateStateBudgets(statesForBudgets, ukFiscalYear);
  for (const budget of stateBudgets) {
    const { _id, ...budgetData } = budget;
    await db
      .collection<StateBudget>("stateBudgets")
      .updateOne({ _id }, { $set: budgetData }, { upsert: true });
  }
  log(`Seeded ${stateBudgets.length} UK regional budgets`);

  // Seed UK country-owned corporation (NHS nationalized healthcare)
  const countryOwnedSeedData = generateCountryOwnedSeedData(statesForBudgets, preset);
  const ukCorpData = countryOwnedSeedData.filter(
    (entry) => entry.corporation.countryOwnerId === "UK"
  );
  for (const entry of ukCorpData) {
    const { _id: corpId, ...corpData } = entry.corporation;
    await corporationsCollection(db).updateOne(
      { _id: corpId },
      { $set: corpData },
      { upsert: true }
    );

    for (const sector of entry.sectors) {
      const { _id: _sectorId, ...sectorData } = sector;
      await db.collection<CorporateSector>("corporateSectors").updateOne(
        {
          corporationId: corpId,
          stateId: sector.stateId,
          sectorType: sector.sectorType,
        },
        { $set: sectorData },
        { upsert: true }
      );
    }
  }
  if (ukCorpData.length > 0) {
    log(`Seeded ${ukCorpData.length} UK country-owned public corporation setup(s)`);
  }

  // Budget indexes (idempotent, safe to run for both US and UK)
  await db
    .collection("stateBudgets")
    .createIndex({ stateId: 1 })
    .catch((error) => {
      logWarning("Index creation failed (may already exist)", {
        component: "AdminSeedRoute",
        action: "createIndex",
        metadata: { index: "stateId", error: String(error) },
      });
    });
  await db
    .collection("enactedLaws")
    .createIndex({ scope: 1, stateId: 1 })
    .catch((error) => {
      logWarning("Index creation failed (may already exist)", {
        component: "AdminSeedRoute",
        action: "createIndex",
        metadata: { index: "scope_stateId", error: String(error) },
      });
    });
  await db
    .collection("enactedLaws")
    .createIndex({ legislationTypeId: 1 })
    .catch((error) => {
      logWarning("Index creation failed (may already exist)", {
        component: "AdminSeedRoute",
        action: "createIndex",
        metadata: { index: "legislationTypeId", error: String(error) },
      });
    });
  log("UK budget indexes ensured");
}
