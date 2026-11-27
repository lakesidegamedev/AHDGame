import type { Corporation } from "@/lib/db/types";

/** Retain an accountable owner until every deferred cash or creditor book can follow it. */
export function hasRetainedFinancialEstate(
  corp: Partial<Corporation>,
  includeLiquidCash = false
): boolean {
  const nonzero = (value: number | undefined) =>
    value !== undefined && (!Number.isFinite(value) || value !== 0);
  return !!(
    (includeLiquidCash && nonzero(corp.liquidCapital)) ||
    nonzero(corp.shareEscrowBalance) ||
    nonzero(corp.pendingOperatingCash) ||
    corp.producerPayables?.claims.length ||
    Object.values(corp.operatingCashArrearsByCurrency ?? {}).some(nonzero) ||
    Object.values(corp.federalTaxArrearsAnchorByCountry ?? {}).some(nonzero) ||
    Object.keys(corp.pendingCompensationRecoveries ?? {}).length ||
    Object.keys(corp.bankTreasuryEscrows ?? {}).length ||
    Object.keys(corp.bankSovereignEscrows ?? {}).length ||
    corp.bankCharter ||
    (includeLiquidCash && corp.shareholders?.length)
  );
}
