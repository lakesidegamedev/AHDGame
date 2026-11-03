import { playerTaxWalletDebit } from "./incomeTaxTiers";

export interface TaxLiability {
  federal: number;
  regional: number;
  collectedFederal?: number;
  collectedRegional?: number;
}

/** Original assessed amounts stay immutable; legacy records start with no collections. */
export function outstandingTax(liability: TaxLiability) {
  const { federal, regional, collectedFederal = 0, collectedRegional = 0 } = liability;
  if (
    ![federal, regional, collectedFederal, collectedRegional].every(
      (n) => Number.isFinite(n) && n >= 0
    ) ||
    collectedFederal > federal + 1e-6 ||
    collectedRegional > regional + 1e-6
  )
    throw Error("Invalid tax collection totals");
  return {
    federal: Math.max(0, federal - collectedFederal),
    regional: Math.max(0, regional - collectedRegional),
  };
}

/** A frozen payment slice, used by both first delivery and crash recovery. */
export interface TaxCollectionSlice {
  federal: number;
  regional: number;
  previousFederal: number;
  previousRegional: number;
  fullyPaid: boolean;
}

export function planTaxCollection(
  liability: TaxLiability,
  availableWallet: number,
  sourceFx: number,
  walletFx?: number
): { slice: TaxCollectionSlice; walletDebit: number } {
  const remaining = outstandingTax(liability);
  if (!Number.isFinite(availableWallet) || availableWallet < 0) throw Error("Invalid tax wallet");
  const fullDebit = playerTaxWalletDebit(
    remaining.federal + remaining.regional,
    sourceFx,
    walletFx
  );
  const budget =
    fullDebit <= availableWallet
      ? remaining.federal + remaining.regional
      : Math.min(
          remaining.federal + remaining.regional,
          Math.floor(((availableWallet * sourceFx) / (walletFx ?? sourceFx)) * 100) / 100
        );
  const total = remaining.federal + remaining.regional;
  const federal =
    total === 0
      ? 0
      : Math.min(remaining.federal, Math.floor(((budget * remaining.federal) / total) * 100) / 100);
  const regional = Math.min(remaining.regional, Math.max(0, budget - federal));
  const adjustedFederal = Math.min(
    remaining.federal,
    federal + Math.max(0, budget - federal - regional)
  );
  const walletDebit = playerTaxWalletDebit(adjustedFederal + regional, sourceFx, walletFx);
  if (walletDebit > availableWallet + 1e-6) throw Error("Tax payment exceeds wallet");
  return {
    slice: {
      federal: adjustedFederal,
      regional,
      previousFederal: liability.collectedFederal ?? 0,
      previousRegional: liability.collectedRegional ?? 0,
      fullyPaid: adjustedFederal + regional >= total - 1e-6,
    },
    walletDebit,
  };
}
