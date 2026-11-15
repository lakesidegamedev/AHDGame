/** Canadian opening transfers and debt service reconcile to their regional and bond books. */
import type { Db } from "mongodb";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { federalSurplus } from "@/lib/budget/federalSurplus";

export async function seedCaOpeningFinance(db: Db, preset: string): Promise<void> {
  if (preset !== "2027-default") return;
  const [budget, regions, bonds] = await Promise.all([
    federalBudgetCollection(db).findOne({ countryId: "CA" }),
    stateBudgetsCollection(db)
      .find({ countryId: "CA" }, { projection: { "revenue.federalGrants": 1 } })
      .toArray(),
    bondsCollection(db)
      .find(
        { countryId: "CA", issuerType: "sovereign", matured: false, defaulted: false },
        { projection: { totalIssued: 1, couponRate: 1 } }
      )
      .toArray(),
  ]);
  if (!budget) return;
  const stateGrants = regions.reduce((sum, region) => sum + region.revenue.federalGrants, 0);
  const principal = bonds.reduce((sum, bond) => sum + bond.totalIssued, 0);
  const debtInterest =
    Math.abs(principal - budget.debt.principal) < 1
      ? bonds.reduce((sum, bond) => sum + (bond.totalIssued * bond.couponRate) / 100, 0)
      : budget.spending.debtInterest;
  const spending = {
    ...budget.spending,
    stateGrants,
    debtInterest,
    total:
      budget.spending.total -
      budget.spending.stateGrants -
      budget.spending.debtInterest +
      stateGrants +
      debtInterest,
  };
  await federalBudgetCollection(db).updateOne(
    { _id: budget._id },
    { $set: { spending, surplus: federalSurplus({ revenue: budget.revenue, spending }) } }
  );
}
