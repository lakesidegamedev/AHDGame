import type { ClientSession, Db } from "mongodb";
import { getCountryConfig, isParliamentarySystem, type CountryId } from "@/lib/constants/countries";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { regionalBudgetsCollection } from "@/lib/db/repositories/regionalBudgets";
import { buildResetRegionalProgramClaims } from "./rules/regionalClaims";
import type { ResetLawProgramDocument } from "./program";

export async function bookRegionalLawDemand(
  db: Db,
  input: {
    country: CountryId;
    regionId: string;
    delta: number;
    programs: ResetLawProgramDocument[];
    session: ClientSession;
  }
) {
  const { country, regionId, delta, programs, session } = input;
  const filter = { _id: regionId, countryId: country };
  const regional = isParliamentarySystem(getCountryConfig(country))
    ? await regionalBudgetsCollection(db).findOne(filter, {
        session,
        projection: { _id: 1, programSettlements: 1 },
      })
    : null;
  const state = regional
    ? null
    : await stateBudgetsCollection(db).findOne(filter, {
        session,
        projection: { _id: 1, authorizedSpending: 1, regionalProgramSettlements: 1 },
      });
  if (!regional && !state) throw new Error("The regional budget is unavailable at enactment");
  const key = regional ? "programSettlements" : "regionalProgramSettlements";
  const pending = Object.fromEntries(
    buildResetRegionalProgramClaims({ programs }).map((p) => [
      p.programId,
      {
        programId: p.programId,
        legislationTypeId: p.legislationTypeId,
        policyOptionId: p.policyOptionId,
        authorizedCost: p.authorizedCost,
        fundedAmount: 0,
        unfundedAmount: p.authorizedCost,
        implementationFactor: 0,
        obligationPriority: p.obligationPriority,
        lastSettledTurn: 0,
        validThroughTurn: 0,
      },
    ])
  );
  const settlements = {
    [key]: {
      ...(regional?.programSettlements ?? state?.regionalProgramSettlements ?? {}),
      ...pending,
    },
  };
  if (regional) {
    const written = await regionalBudgetsCollection(db).updateOne(
      filter,
      { $inc: { enactedBillCosts: delta, surplus: -delta }, $set: settlements },
      { session }
    );
    if (written.matchedCount !== 1) throw new Error("Regional budget changed during enactment");
  } else {
    const written = await stateBudgetsCollection(db).updateOne(
      filter,
      {
        $inc: {
          "spending.total": delta,
          "spending.byCategory.resetLegislation": delta,
          surplus: -delta,
          ...(state?.authorizedSpending
            ? {
                "authorizedSpending.total": delta,
                "authorizedSpending.byCategory.resetLegislation": delta,
              }
            : {}),
        },
        $set: settlements,
      },
      { session }
    );
    if (written.matchedCount !== 1) throw new Error("State budget changed during enactment");
  }
}
