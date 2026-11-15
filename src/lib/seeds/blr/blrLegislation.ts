import {
  makeEasternBlocLegislation,
  makeEasternBlocSpendingLegislation,
} from "@/lib/seeds/shared/easternBlocLegislation";

/** Byelorussia legislation (1979) — dual-scenario planned-economy set. */
const blrTaxAndSystemLegislation = makeEasternBlocLegislation({
  prefix: "blr",
  scope: "blr",
  chamberKey: "supremeSoviet",
  rulingParty: "the CPB",
  reformProgramme: "Soviet reform",
});

/**
 * Byelorussia spending legislation (1953 baseline). gdp/population MUST match
 * the "BLR" makeEasternBlocBudget1953 call in src/lib/seeds/reference/budgets.ts
 * (SUR 140B against 8.1M), as easternBlocSpending1953.test.ts enforces.
 *
 * Deliberately mismatched with blrRegions1953.ts (7.7M / SUR 50,000M) because
 * that region seed is the canonical republican figure on the RSFSR scale, while
 * this block prices the spending ladder against the union fiscal base. Do not
 * reconcile the two by editing this file.
 *
 * Byelorussia is a union republic, so its investment programme is the all-union
 * Fifth Five-Year Plan (1951-55), overwhelmingly war reconstruction: Minsk
 * rebuilt, MAZ and MTZ stood up, Soligorsk potash opened.
 */
const blrSpendingLegislation = makeEasternBlocSpendingLegislation({
  prefix: "blr",
  scope: "blr",
  chamberKey: "supremeSoviet",
  // The region seed is canonical: the six oblasts sum to SUR 50,000M and
  // 7.7M people, on the same ruble basis the RSFSR macro-regions use. The
  // budget seed is reconciled to this, not the other way round.
  gdp: 50_000_000_000,
  population: 7_700_000,
  planName: "the Fifth Five-Year Plan (1951-55)",
});

export const blrLegislationTypes = [...blrTaxAndSystemLegislation, ...blrSpendingLegislation];
export default blrLegislationTypes;
