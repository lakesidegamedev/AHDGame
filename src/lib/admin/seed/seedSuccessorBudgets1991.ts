import type { Db } from "mongodb";
import type { State } from "@/lib/db/types";
import type { StateBudget } from "@/lib/db/types/budget";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import type { CountryId } from "@/lib/constants/countries";
import {
  generateCountryOwnedSeedData,
  generateStateBudgets,
  getInitialNationalBudgetsForPreset,
} from "@/lib/seeds/reference/budgets";
import { upsertCountryOwnedCorpEntries } from "./upsertCountryOwnedCorps";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { statesCollection } from "@/lib/db/repositories/states";

const COUNTRY_IDS = [
  "RU",
  "PL",
  "CS",
  "HU",
  "RO",
  "BG",
  "YU",
] as const satisfies readonly CountryId[];

/** Seed the seven transition budgets after regional GDP reconciliation. */
export async function seedSuccessorBudgets1991(
  db: Db,
  reset: boolean,
  preset: string,
  log: (message: string) => void
): Promise<void> {
  if (preset !== "1991-default") return;
  if (reset) {
    await federalBudgetCollection(db).deleteMany({ countryId: { $in: [...COUNTRY_IDS] } });
    await db
      .collection<StateBudget>("stateBudgets")
      .deleteMany({ countryId: { $in: [...COUNTRY_IDS] } });
  }
  const budgets = getInitialNationalBudgetsForPreset(preset).filter((budget) =>
    (COUNTRY_IDS as readonly string[]).includes(budget.countryId)
  );
  if (budgets.length !== COUNTRY_IDS.length)
    throw new Error("Missing 1991 transition national budget");
  const now = new Date();
  await federalBudgetCollection(db).bulkWrite(
    budgets.map(({ _id, ...budget }) => ({
      updateOne: { filter: { _id }, update: { $set: { ...budget, updatedAt: now } }, upsert: true },
    }))
  );
  const regions = await statesCollection(db)
    .find({ countryId: { $in: [...COUNTRY_IDS] } })
    .project({ _id: 1, countryId: 1, population: 1, gdp: 1 })
    .toArray();
  const stateBudgets = generateStateBudgets(
    regions.map((region) => ({
      id: region._id,
      population: region.population,
      gdp: region.gdp,
      countryId: region.countryId,
    })),
    1991
  );
  if (stateBudgets.length !== regions.length)
    throw new Error("Missing 1991 transition regional budget");
  await db.collection<StateBudget>("stateBudgets").bulkWrite(
    stateBudgets.map(({ _id, ...budget }) => ({
      updateOne: { filter: { _id }, update: { $set: budget }, upsert: true },
    }))
  );
  // seedRuBudgets returns on 1991; seed RU owned producing SOEs
  // via the RU seeder path (RU states, gated on commandEconomyEnabled).
  // Upserts only, so repeat seeding is stable.
  const gameConfig = await db
    .collection<GameConfig>("gameConfig")
    .findOne({ _id: "default" }, { projection: { commandEconomyEnabled: 1 } });
  const commandEconomyEnabled = gameConfig?.commandEconomyEnabled === true;
  const ruStatesForCorps = regions
    .filter((region) => countryHasFeature("ruAdmin", region.countryId))
    .map((region) => ({
      id: region._id,
      population: region.population,
      gdp: region.gdp,
      countryId: region.countryId,
    }));
  const ruCorpData = generateCountryOwnedSeedData(
    ruStatesForCorps,
    preset,
    commandEconomyEnabled,
    log
  ).filter((entry) => countryHasFeature("ruAdmin", entry.corporation.countryOwnerId));
  await upsertCountryOwnedCorpEntries(db, "RU", ruCorpData);
  const ruSectorCount = ruCorpData.reduce((n, e) => n + e.sectors.length, 0);
  if (ruCorpData.length > 0)
    log(
      `Seeded ${ruCorpData.length} RU state enterprise(s) with ${ruSectorCount} owned producing sector(s)`
    );
  log(`Seeded ${budgets.length} transition national and ${stateBudgets.length} regional budgets`);
}
