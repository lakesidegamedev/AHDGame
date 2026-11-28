import { settleRegionalBudget } from "@/lib/governmentFinance/rules/regionalSettlement";
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { StateBudget } from "@/lib/db/types/budget";
import type { RegionalBudget } from "@/lib/db/types/regionalBudget";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { regionalBudgetsCollection } from "@/lib/db/repositories/regionalBudgets";
import { loadCountryTiers } from "@/lib/country/countryTier";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { settleRegionalDebt } from "./rules/regionalDebt";

export async function processRegionalDebt(db: Db, turn: number) {
  const countries = (await loadCountryTiers(db)).fullSimulationIds;
  if (!countries.length) return { regionsProcessed: 0 };
  const filter = { countryId: { $in: countries } };
  const [states, regions] = await Promise.all([
    stateBudgetsCollection(db)
      .find(filter, {
        projection: {
          _id: 1,
          countryId: 1,
          revenue: 1,
          spending: 1,
          authorizedSpending: 1,
          regionalProgramSettlements: 1,
          balance: 1,
          financing: 1,
        },
      })
      .toArray(),
    regionalBudgetsCollection(db)
      .find(filter, {
        projection: {
          _id: 1,
          countryId: 1,
          totalBudget: 1,
          enactedBillCosts: 1,
          programSettlements: 1,
          financing: 1,
        },
      })
      .toArray(),
  ]);
  const authoritativeRegions = new Set(regions.map((r) => `${r.countryId}:${r._id}`));
  const stateOps: AnyBulkWriteOperation<StateBudget>[] = [];
  const regionOps: AnyBulkWriteOperation<RegionalBudget>[] = [];
  for (const budget of states) {
    if (
      !budget.countryId ||
      authoritativeRegions.has(`${budget.countryId}:${budget._id}`) ||
      (budget.financing?.lastSettledTurn ?? 0) >= turn
    )
      continue;
    const spending = budget.authorizedSpending ?? budget.spending;
    const financing = settleRegionalDebt({
      previous: budget.financing,
      openingCash: budget.balance ?? 0,
      annualRevenue: budget.revenue.total,
      annualPrimarySpending: spending.total - (spending.interestPayments ?? 0),
      turn,
      turnsPerYear: TURNS_PER_YEAR,
    });
    const total = spending.total - (spending.interestPayments ?? 0) + financing.annualInterest;
    stateOps.push({
      updateOne: {
        filter: {
          _id: budget._id,
          countryId: budget.countryId,
          "financing.lastSettledTurn": budget.financing?.lastSettledTurn ?? { $exists: false },
          balance: budget.balance,
          "revenue.total": budget.revenue.total,
          spending: budget.spending,
          authorizedSpending: budget.authorizedSpending ?? { $exists: false },
          regionalProgramSettlements: budget.regionalProgramSettlements ?? { $exists: false },
        },
        update: {
          $set: {
            financing,
            balance: financing.cash,
            spending: { ...spending, interestPayments: financing.annualInterest, total },
            regionalProgramSettlements: fundPrograms(budget.regionalProgramSettlements ?? {}, turn),
            surplus: budget.revenue.total - total,
          },
        },
      },
    });
  }
  for (const budget of regions) {
    if (
      !authoritativeRegions.has(`${budget.countryId}:${budget._id}`) ||
      (budget.financing?.lastSettledTurn ?? 0) >= turn
    )
      continue;
    const financing = settleRegionalDebt({
      previous: budget.financing,
      openingCash: budget.financing?.cash ?? 0,
      annualRevenue: budget.totalBudget,
      annualPrimarySpending: budget.enactedBillCosts,
      turn,
      turnsPerYear: TURNS_PER_YEAR,
    });
    const surplus = budget.totalBudget - budget.enactedBillCosts - financing.annualInterest;
    regionOps.push({
      updateOne: {
        filter: {
          _id: budget._id,
          countryId: budget.countryId,
          "financing.lastSettledTurn": budget.financing?.lastSettledTurn ?? { $exists: false },
          financing: budget.financing ?? { $exists: false },
          enactedBillCosts: budget.enactedBillCosts,
          totalBudget: budget.totalBudget,
          programSettlements: budget.programSettlements ?? { $exists: false },
        },
        update: {
          $set: {
            financing,
            interestPayments: financing.annualInterest,
            fundedBillCosts: budget.enactedBillCosts,
            unfundedBillCosts: 0,
            programSettlements: fundPrograms(budget.programSettlements ?? {}, turn),
            surplus,
            isOverBudget: surplus < 0,
          },
        },
      },
    });
  }
  if (stateOps.length) {
    const result = await stateBudgetsCollection(db).bulkWrite(stateOps);
    if (result.matchedCount !== stateOps.length)
      throw new Error("Regional state financing changed during settlement; retry required");
  }
  if (regionOps.length) {
    const result = await regionalBudgetsCollection(db).bulkWrite(regionOps);
    if (result.matchedCount !== regionOps.length)
      throw new Error("Regional financing changed during settlement; retry required");
  }
  return { regionsProcessed: stateOps.length + regionOps.length };
}

function fundPrograms(
  programs: NonNullable<StateBudget["regionalProgramSettlements"]>,
  turn: number
) {
  const result = settleRegionalBudget({
    availableBudget: 0,
    allowBorrowing: true,
    claims: Object.values(programs).map((p) => ({
      ...p,
      fundingSemantics: "appropriation_included",
      continuing: true,
    })),
  });
  return Object.fromEntries(
    result.programs.map((p) => [
      p.programId,
      { ...p, lastSettledTurn: turn, validThroughTurn: turn },
    ])
  );
}
