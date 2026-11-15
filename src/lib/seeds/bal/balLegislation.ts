import {
  makeEasternBlocLegislation,
  makeEasternBlocSpendingLegislation,
} from "@/lib/seeds/shared/easternBlocLegislation";

/** Baltics tax and system legislation (1979 authoring, used by both presets). */
const balTaxAndSystemLegislation = makeEasternBlocLegislation({
  prefix: "bal",
  scope: "bal",
  chamberKey: "supremeSoviet",
  rulingParty: "the CPSU",
  reformProgramme: "Soviet reform and independence",
});

/**
 * Baltics spending legislation (1953 baseline).
 *
 * Without spending types the country carries only revenue and system levers,
 * so calculateFederalSpending falls back to static baselineSpendingByCategory
 * and the budget is frozen for the whole game.
 *
 * gdp/population MUST match the "BAL" makeEasternBlocBudget1953 call. The
 * factory computes annualCostPerCapita as fraction × gdp ÷ population; a
 * mismatch silently books the wrong share of GDP in every category.
 *
 * Values are the country's canonical 1953 totals: population 2,900,000 and GDP
 * ₽29.167bn (balRegions1953.ts sum × one million). Region rollup, budget seed
 * and law pricing must quote the same GDP.
 *
 * Plan: Fifth Five-Year Plan (1951-55), including the Kohtla-Jarve shale
 * complex, Riga machine-building, and capital rebuilding of Tallinn and Riga.
 */
const balSpendingLegislation = makeEasternBlocSpendingLegislation({
  prefix: "bal",
  scope: "bal",
  chamberKey: "supremeSoviet",
  gdp: 29_167_000_000,
  population: 2_900_000,
  planName: "the Fifth Five-Year Plan (1951-55)",
});

export const balLegislationTypes = [...balTaxAndSystemLegislation, ...balSpendingLegislation];
export default balLegislationTypes;
