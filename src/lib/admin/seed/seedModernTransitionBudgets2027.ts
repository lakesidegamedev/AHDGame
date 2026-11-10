import type { Db } from "mongodb";
import {
  getInitialNationalBudgetsForPreset,
  getNationalBudgetSeedConfigsForPreset,
} from "@/lib/seeds/reference/budgets";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";

const COUNTRY_IDS = ["HU", "PL", "RO", "BG"] as const;

/** Persist only authored 2027 fiscal rows for the included transition countries. */
export async function seedModernTransitionBudgets2027(
  db: Db,
  reset: boolean,
  preset: string,
  log: (message: string) => void
): Promise<void> {
  if (preset !== "2027-default") return;

  const authored = new Set<string>(
    getNationalBudgetSeedConfigsForPreset(preset)
      .filter((config) => (COUNTRY_IDS as readonly string[]).includes(config.countryId))
      .filter((config) => config.fiscalYear === 2027)
      .map((config) => config.countryId)
  );
  const budgets = getInitialNationalBudgetsForPreset(preset).filter((budget) =>
    authored.has(budget.countryId)
  );

  if (reset) {
    await federalBudgetCollection(db).deleteMany({ countryId: { $in: [...COUNTRY_IDS] } });
  }
  const now = new Date();
  for (const { _id, ...budget } of budgets) {
    await federalBudgetCollection(db).updateOne(
      { _id },
      { $set: { ...budget, updatedAt: now } },
      { upsert: true }
    );
  }
  log(`Seeded ${budgets.length} authored 2027 transition national budget(s)`);
}
