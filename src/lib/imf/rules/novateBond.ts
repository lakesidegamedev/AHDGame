import type { Bond } from "@/lib/db/types";
import { roundFaceToBondUnits } from "@/lib/bonds/rules/units";

/** Haircut the old debt while retaining each creditor's proportional claim against the assuming institution. */
export function retainedImfBondClaims(bond: Bond, retention: number) {
  if (
    !Number.isFinite(retention) ||
    retention <= 0 ||
    retention > 1 ||
    !Number.isFinite(bond.totalIssued) ||
    bond.totalIssued <= 0
  )
    throw new Error("Invalid IMF bond retention quote");
  const totalIssued = roundFaceToBondUnits(bond.totalIssued * retention);
  if (!(totalIssued > 0)) throw new Error("IMF retained bond principal rounds to zero");
  const scale = totalIssued / bond.totalIssued;
  const holders = (bond.holders ?? []).map((holder) => {
    if (!Number.isFinite(holder.units) || holder.units < 0)
      throw new Error("Invalid retained bond holding");
    return {
      ...holder,
      units: holder.units * scale,
      ...(holder.avgCostPerUnit !== undefined
        ? { avgCostPerUnit: holder.avgCostPerUnit / scale }
        : {}),
    };
  });
  if (!Number.isFinite(bond.publicFloat ?? 0) || (bond.publicFloat ?? 0) < 0)
    throw new Error("Invalid retained bond float");
  return { totalIssued, holders, publicFloat: (bond.publicFloat ?? 0) * scale };
}
