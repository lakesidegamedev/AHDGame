/**
 * Self-heal for a missing `federalBudget` document.
 *
 * Worlds created via a partial seed path can have a live central bank but no
 * federal budget, and downstream consumers silently skip such a country. This
 * creates the preset's default budget on first encounter so the country
 * starts accruing fiscal history immediately.
 */
import type { Db } from "mongodb";
import type { FederalBudget } from "@/lib/db/types/budget";
import type { CountryId } from "@/lib/constants/countries";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";

/** Per-process dedup so the unexpected-miss warning fires once, not every turn. */
const warnedUnexpectedMisses = new Set<string>();

export async function ensureFederalBudget(
  db: Db,
  countryId: CountryId,
  preset: string
): Promise<FederalBudget | null> {
  const budgetId = getNationalBudgetId(countryId);
  const existing = await (await getFederalBudgetCollection(db)).findOne({ _id: budgetId });
  if (existing) return existing;

  const { getInitialNationalBudgetsForPreset } = await import("@/lib/seeds/reference/budgets");
  const defaultBudget = getInitialNationalBudgetsForPreset(preset).find(
    (b) => b.countryId === countryId
  );
  if (!defaultBudget) {
    // Preset-aware central-bank seeding (#2073) keeps known currency-only
    // countries out of this path. A miss here is therefore always unexpected.
    const dedupKey = `${preset}:${countryId}`;
    if (!warnedUnexpectedMisses.has(dedupKey)) {
      warnedUnexpectedMisses.add(dedupKey);
      console.warn(
        `[ensureFederalBudget] no default budget seed for ${countryId} under preset "${preset}"; ` +
          `cannot self-heal (unexpected; see #2073 monetary coverage)`
      );
    }
    return null;
  }

  const { _id, ...budgetData } = defaultBudget;
  await (
    await getFederalBudgetCollection(db)
  ).updateOne(
    { _id },
    { $setOnInsert: { ...budgetData, updatedAt: new Date() } },
    { upsert: true }
  );
  console.warn(
    `[ensureFederalBudget] ${countryId} had a centralBanks doc but no federalBudget ` +
      `(_id="${budgetId}") — seeded default from preset "${preset}". This world was ` +
      `likely bootstrapped via a partial seed path; check scripts/seed-sandbox.ts.`
  );
  return (await getFederalBudgetCollection(db)).findOne({ _id: budgetId });
}

/**
 * Self-heal many countries at once. One projected `_id` read finds the budgets
 * that exist; only the missing ones go through `ensureFederalBudget`, so the
 * healing write and its warning are exactly the single-country path. On the
 * normal turn nothing is missing and this is one round trip instead of one
 * read per country.
 */
export async function ensureFederalBudgets(
  db: Db,
  countryIds: readonly CountryId[],
  preset: string
): Promise<void> {
  const unique = [...new Set(countryIds)];
  if (unique.length === 0) return;
  const budgetIds = unique.map((countryId) => getNationalBudgetId(countryId));
  const present = new Set(
    (
      await (
        await getFederalBudgetCollection(db)
      )
        .find({ _id: { $in: budgetIds } }, { projection: { _id: 1 } })
        .toArray()
    ).map((budget) => String(budget._id))
  );
  await Promise.all(
    unique
      .filter((_, index) => !present.has(budgetIds[index]!))
      .map((countryId) => ensureFederalBudget(db, countryId, preset))
  );
}

/**
 * Read-only cross-check of every `centralBanks` doc against `federalBudget`,
 * used by the gameHealthSnapshot integrity check so a missing budget surfaces
 * as a data-integrity error instead of turns silently no-oping.
 */
export async function findCountriesMissingFederalBudget(db: Db): Promise<string[]> {
  const banks = await db
    .collection("centralBanks")
    .find({}, { projection: { countryId: 1 } })
    .toArray();
  if (banks.length === 0) return [];
  const budgetIds = banks.map((bank) => getNationalBudgetId(bank.countryId as CountryId));
  const budgets = await (
    await getFederalBudgetCollection(db)
  )
    .find({ _id: { $in: budgetIds } }, { projection: { _id: 1 } })
    .toArray();
  const present = new Set(budgets.map((budget) => String(budget._id)));
  return banks
    .filter((_, index) => !present.has(budgetIds[index]))
    .map((bank) => bank.countryId as string);
}

/**
 * Read-only check for the *other* half of the sandbox-seed-audit-t101 bug:
 * a federalBudget doc can exist and be actively updated every turn while its
 * own `countryId` field points at the wrong country. The sandbox's `_id:
 * "federal"` doc (which `getNationalBudgetId("US")` resolves to, and which
 * inflationRecalc/treasuryTurn correctly join on by `_id`) had `countryId:
 * "BAL"` — so every OTHER consumer that derives a country from
 * `budget.countryId` instead of the `_id`/legacy-fallback convention (e.g.
 * `sovereign.ts`, `fiscalYear.ts`, `corporationDetail.ts`) would misattribute
 * this budget to BAL instead of US. `_id === "federal"` is the one legacy
 * exception (must map to US); every other budget's `_id` IS its country code.
 */
export async function findFederalBudgetCountryMismatches(
  db: Db
): Promise<{ budgetId: string; expectedCountryId: string; actualCountryId: string | undefined }[]> {
  const budgets = await (
    await getFederalBudgetCollection(db)
  )
    .find({}, { projection: { countryId: 1 } })
    .toArray();
  const mismatches: {
    budgetId: string;
    expectedCountryId: string;
    actualCountryId: string | undefined;
  }[] = [];
  for (const budget of budgets) {
    const budgetId = String(budget._id);
    const expectedCountryId = budgetId === "federal" ? "US" : budgetId;
    if (budget.countryId !== expectedCountryId) {
      mismatches.push({ budgetId, expectedCountryId, actualCountryId: budget.countryId });
    }
  }
  return mismatches;
}
