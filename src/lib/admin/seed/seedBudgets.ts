import type { Db } from "mongodb";
import { logWarning } from "@/lib/utils/errorLog";
import type { CorporateSector, State } from "@/lib/db/types";
import type { EnactedLaw, StateBudget, FormulaGrant } from "@/lib/db/types/budget";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

/**
 * Seeds US-only budget data: federal budget, US enacted laws, US state budgets,
 * US country-owned corporation, and formula grants. UK data is handled by seedUkBudgets.
 *
 * `preset` selects 2019-default vs 1991-default fiscal-year configs. Defaults
 * to 2019 for back-compat with callers that don't yet thread the preset
 * through.
 */
export async function seedBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    // Only delete US-specific budget data, not UK/JP
    await federalBudgetCollection(db).deleteMany({ countryId: "US" });
    const usStateIds = (
      await db.collection("states").find({ countryId: "US" }).project({ _id: 1 }).toArray()
    ).map((s) => s._id as string);
    if (usStateIds.length > 0) {
      await db
        .collection<StateBudget>("stateBudgets")
        .deleteMany({ stateId: { $in: usStateIds }, countryId: "US" });
    }
    // The US enacted-law book comes from `seedPoliticalLegislationBaseline`,
    // which strips the legacy US catalog via `POLITICAL_LEGISLATION_EXCLUDED_SCOPES`.
    // That seeder lives in the orchestrators, NOT in `runSeed`, so deleting here
    // would remove the US law book with nothing to restore it. Calling it from
    // here would be worse: it prices every LAW_COUNTRY_ID against
    // `countryFiscalBase`, and on the standalone path only US budgets exist,
    // mispricing UK/RU/DD.
    // Formula grants are US-only, safe to drop
    await db
      .collection("formulaGrants")
      .drop()
      .catch(() => {
        /* collection may not exist */
      });
    log("Reset: deleted US budget data");
  }
  const {
    getInitialNationalBudgetsForPreset,
    getNationalBudgetSeedConfigsForPreset,
    generateCountryOwnedSeedData,
    generateStateBudgets,
  } = await import("@/lib/seeds/reference/budgets");
  const { formulaGrants } = await import("@/lib/seeds/reference/formulaGrants");

  const presetBudgets = getInitialNationalBudgetsForPreset(preset);
  const usFiscalYear =
    getNationalBudgetSeedConfigsForPreset(preset).find((c) =>
      countryHasFeature("usAdmin", c.countryId)
    )?.fiscalYear ?? 2020;

  // Seed US national budget only (UK is handled by seedUkBudgets)
  const usNationalBudgets = presetBudgets.filter((b) => countryHasFeature("usAdmin", b.countryId));
  for (const nationalBudget of usNationalBudgets) {
    const { _id, ...budgetData } = nationalBudget;
    await federalBudgetCollection(db).updateOne(
      { _id },
      { $set: { ...budgetData, updatedAt: new Date() } },
      { upsert: true }
    );
  }
  log(`Seeded ${usNationalBudgets.length} US national budget(s)`);

  // Get US states for generating state budgets (UK handled by seedUkBudgets, JP by seedJpBudgets)
  const states = await db.collection<State>("states").find({ countryId: "US" }).toArray();
  const statesForBudgets = states.map((s) => ({
    id: s._id,
    population: s.population,
    gdp: s.gdp,
    countryId: s.countryId,
  }));
  const stateBudgets = generateStateBudgets(statesForBudgets, usFiscalYear);
  for (const budget of stateBudgets) {
    const { _id, ...budgetData } = budget;
    await db
      .collection<StateBudget>("stateBudgets")
      .updateOne({ _id }, { $set: budgetData }, { upsert: true });
  }
  log(`Seeded ${stateBudgets.length} US state budgets`);

  // Seed US country-owned public corporation (UK NHS handled by seedUkBudgets, JP by seedJpBudgets)
  const countryOwnedSeedData = generateCountryOwnedSeedData(statesForBudgets, preset);
  const usCorpData = countryOwnedSeedData.filter((entry) =>
    countryHasFeature("usAdmin", entry.corporation.countryOwnerId)
  );
  for (const entry of usCorpData) {
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
  if (usCorpData.length > 0) {
    log(`Seeded ${usCorpData.length} US country-owned public corporation setup(s)`);
  }

  // Seed formula grants
  const validGrantIds = formulaGrants.map((g) => g.programId);
  for (const grant of formulaGrants) {
    await db
      .collection<FormulaGrant>("formulaGrants")
      .updateOne({ programId: grant.programId }, { $set: grant }, { upsert: true });
  }

  // Remove stale formula grants that no longer exist
  const grantDeleteResult = await db.collection("formulaGrants").deleteMany({
    programId: { $nin: validGrantIds },
  });
  const staleGrantsRemoved = grantDeleteResult.deletedCount || 0;

  log(
    `Seeded ${formulaGrants.length} formula grants${staleGrantsRemoved > 0 ? `, removed ${staleGrantsRemoved} stale entries` : ""}`
  );

  // Budget indexes
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
  log("Budget indexes created");
}
