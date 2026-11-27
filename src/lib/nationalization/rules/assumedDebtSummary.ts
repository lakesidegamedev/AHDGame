import { perTurnCouponPayment } from "@/lib/constants/bonds";

export function assumedDebtSummary(
  bonds: readonly {
    principal: number;
    couponRate: number;
    currencyCode: string;
    matured: boolean;
    status: string;
  }[],
  currency: string,
  rates: ReadonlyMap<string, number>
): { principalLocal: number | null; couponPerTurnLocal: number | null } {
  let principalLocal = 0,
    couponPerTurnLocal = 0;
  for (const bond of bonds) {
    if (bond.matured) continue;
    const source = rates.get(bond.currencyCode),
      target = rates.get(currency);
    if (
      bond.currencyCode !== currency &&
      (!(source! > 0) || !Number.isFinite(source) || !(target! > 0) || !Number.isFinite(target))
    )
      return { principalLocal: null, couponPerTurnLocal: null };
    const multiplier = bond.currencyCode === currency ? 1 : target! / source!;
    principalLocal += bond.principal * multiplier;
    if (bond.status === "Performing")
      couponPerTurnLocal += perTurnCouponPayment(bond.couponRate, bond.principal) * multiplier;
  }
  return { principalLocal, couponPerTurnLocal };
}
