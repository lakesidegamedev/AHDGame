import type { LedgerLeg } from "@/lib/ledger/types";

/**
 * Float tolerance for conservation checks. ε = max(0.01, 1e-9 × max|leg|):
 * a floor for tiny entries that scales with magnitude for large ones.
 */
export function epsilonFor(magnitudes: number[]): number {
  const maxMag = magnitudes.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return Math.max(0.01, 1e-9 * maxMag);
}

function anchorResidual(legs: Pick<LedgerLeg, "anchorAmount">[]): number {
  return legs.reduce((sum, leg) => sum + leg.anchorAmount, 0);
}

/** Entry balances when |Σ anchorAmount| < ε. */
export function isAnchorBalanced(legs: Pick<LedgerLeg, "anchorAmount">[]): boolean {
  const residual = anchorResidual(legs);
  const eps = epsilonFor(legs.map((l) => l.anchorAmount));
  return Math.abs(residual) < eps;
}

/**
 * Native residual for each single-currency group. Cross-currency (FX) entries
 * legitimately don't net to zero natively — those are skipped. A same-currency
 * entry that doesn't net to zero natively is the t841 raw-foreign-as-local
 * signature. Returns the worst offending {currency, residual} or null.
 */
export function nativeImbalance(
  legs: Pick<LedgerLeg, "amount" | "currencyCode">[]
): { currencyCode: string; residual: number } | null {
  const byCurrency = new Map<string, number[]>();
  for (const leg of legs) {
    const arr = byCurrency.get(leg.currencyCode) ?? [];
    arr.push(leg.amount);
    byCurrency.set(leg.currencyCode, arr);
  }
  // An entry that spans multiple currencies is a legitimate FX conversion —
  // native sums are expected to differ. Only single-currency entries are
  // required to net to zero natively.
  if (byCurrency.size !== 1) return null;
  let worst: { currencyCode: string; residual: number } | null = null;
  for (const [currencyCode, amounts] of byCurrency) {
    const residual = amounts.reduce((a, b) => a + b, 0);
    const eps = epsilonFor(amounts);
    if (Math.abs(residual) >= eps) {
      if (!worst || Math.abs(residual) > Math.abs(worst.residual)) {
        worst = { currencyCode, residual };
      }
    }
  }
  return worst;
}
