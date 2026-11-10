/**
 * Turn shell for the 2027 society pressures: loads the enacted laws, sums
 * national age structures and writes the aging cost pressure the federal
 * budget reads. The rules live in `./rules`.
 */
import type { Db } from "mongodb";
import type { EnactedLaw } from "@/lib/db/types/budget";
import type { AgeSexVector } from "@/lib/demographics/cohortVector";
import { keepLatestActiveLawPerType } from "@/lib/budget/keepLatestActiveLawPerType";
import { lifeExpectancyGain } from "@/lib/demographics/rules/demographicPaths";
import { computeAgingCostPressure, type AgingCostPressure } from "./rules/agingCosts";
import {
  NO_SOCIETY_LAWS,
  SOCIETY_LAW_SLUGS,
  pensionAgeShiftYears,
  societyLawPositionsByCountry,
  type SocietyLawPositions,
} from "./rules/laws";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";

export { presetUsesSocietyPressures } from "./preset";

/** Latest enacted option of each society law, by country. One read. */
export async function loadSocietyLawPositions(
  db: Db,
  countryIds: readonly string[]
): Promise<Map<string, SocietyLawPositions>> {
  const typeIds = countryIds.flatMap((countryId) =>
    SOCIETY_LAW_SLUGS.map((slug) => `${countryId.toLowerCase()}_${slug}`)
  );
  if (typeIds.length === 0) return new Map();
  const rows = await db
    .collection<EnactedLaw>("enactedLaws")
    .find(
      { scope: "national", legislationTypeId: { $in: typeIds }, repealedAt: { $exists: false } },
      { projection: { legislationTypeId: 1, policyOptionIndex: 1, enactedAt: 1 } }
    )
    .toArray();
  return societyLawPositionsByCountry(keepLatestActiveLawPerType(rows));
}

/** Sum region vectors into one national vector per country. */
export function nationalAgeVectors(
  regions: readonly { countryId: string; vector: AgeSexVector }[]
): Map<string, AgeSexVector> {
  const out = new Map<string, AgeSexVector>();
  for (const { countryId, vector } of regions) {
    const total = out.get(countryId) ?? {
      male: new Array<number>(101).fill(0),
      female: new Array<number>(101).fill(0),
    };
    for (let age = 0; age <= 100; age++) {
      total.male[age] += vector.male[age] ?? 0;
      total.female[age] += vector.female[age] ?? 0;
    }
    out.set(countryId, total);
  }
  return out;
}

/**
 * Write each country's aging cost pressure onto its federal budget. A level
 * computed from this turn's population, so a repeated write is harmless.
 */
export async function persistAgingCostPressure(
  db: Db,
  input: {
    turn: number;
    year: number;
    workingAge: number;
    retirementAge: number;
    regions: readonly { countryId: string; vector: AgeSexVector }[];
  }
): Promise<void> {
  const vectors = nationalAgeVectors(input.regions);
  const countryIds = [...vectors.keys()];
  if (countryIds.length === 0) return;
  const [budgets, laws] = await Promise.all([
    federalBudgetCollection(db)
      .find(
        { countryId: { $in: countryIds } },
        { projection: { countryId: 1, agingCostPressure: 1 } }
      )
      .toArray(),
    loadSocietyLawPositions(db, countryIds),
  ]);
  const ops = budgets.flatMap((budget) => {
    const countryId = String(budget.countryId ?? budget._id);
    const ages = vectors.get(countryId);
    if (!ages) return [];
    const pressure: AgingCostPressure = computeAgingCostPressure({
      ages,
      turn: input.turn,
      workingAge: input.workingAge,
      retirementAge: input.retirementAge,
      pensionAgeShift: pensionAgeShiftYears(
        (laws.get(countryId) ?? NO_SOCIETY_LAWS).pensionIndexation,
        lifeExpectancyGain(countryId, input.year)
      ),
      previous: budget.agingCostPressure,
    });
    return [
      {
        updateOne: {
          filter: { _id: budget._id },
          update: { $set: { agingCostPressure: pressure } },
        },
      },
    ];
  });
  if (ops.length > 0) await federalBudgetCollection(db).bulkWrite(ops);
}
