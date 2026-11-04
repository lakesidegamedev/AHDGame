/**
 * Shell for the national minimum wage law floor: reads the national policy rows
 * for minimum wage laws and hands them to the rules
 * (`src/lib/labour/rules/minimumWageLaw.ts`).
 */
import type { Db } from "mongodb";
import type { StatePolicy } from "@/lib/db/types/statePolicy";
import { NATIONAL_SCOPE } from "@/lib/constants/nationalScope";
import { buildMinWageRatioByCountry } from "@/lib/labour/laborCost";
import {
  buildMinWageRatioWithLaws,
  minimumWageLawOn,
  MINIMUM_WAGE_LAW_TYPE_IDS,
  type MinimumWageBudget,
  type NationalMinimumWagePolicy,
} from "@/lib/labour/rules/minimumWageLaw";

/** Federal budget country id of a national policy row ("federal" is the US, "jp_national" is JP). */
function nationalPolicyCountryId(row: Pick<StatePolicy, "stateId" | "countryId">): string | null {
  const mapped = NATIONAL_SCOPE[row.stateId];
  if (mapped) return mapped;
  if (row.countryId) return row.countryId.toUpperCase();
  const match = /^([a-z]{2,3})_national$/.exec(row.stateId);
  return match ? match[1].toUpperCase() : null;
}

/** National minimum wage laws in force, one row per country that has one. */
export async function loadNationalMinimumWagePolicies(
  db: Db
): Promise<NationalMinimumWagePolicy[]> {
  const rows = await db
    .collection<StatePolicy>("statePolicies")
    .find(
      { legislationTypeId: { $in: [...MINIMUM_WAGE_LAW_TYPE_IDS] }, scope: "national" },
      {
        projection: {
          stateId: 1,
          countryId: 1,
          legislationTypeId: 1,
          policyOptionId: 1,
          policyOptionIndex: 1,
        },
      }
    )
    .toArray();
  const out: NationalMinimumWagePolicy[] = [];
  for (const row of rows) {
    const countryId = nationalPolicyCountryId(row);
    if (!countryId) continue;
    out.push({
      countryId,
      legislationTypeId: row.legislationTypeId,
      policyOptionId: row.policyOptionId,
      policyOptionIndex: row.policyOptionIndex,
    });
  }
  return out;
}

/**
 * The per-country minimum wage Kaitz map for the turn. Stage off: the admin
 * ratios only, with no extra read.
 */
export async function resolveMinWageRatioByCountry(
  db: Db,
  budgets: ReadonlyArray<MinimumWageBudget>,
  minimumWageLawStage: number | null | undefined
): Promise<Map<string, number>> {
  if (!minimumWageLawOn(minimumWageLawStage)) return buildMinWageRatioByCountry(budgets);
  return buildMinWageRatioWithLaws(budgets, await loadNationalMinimumWagePolicies(db));
}
