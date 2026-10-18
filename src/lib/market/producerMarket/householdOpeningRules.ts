/**
 * One-time household opening cash for the producer-market cutover (owner
 * decision 2026-10-18: about 3 turns of today's household spending).
 *
 * This is the only place the cutover creates money, so it is kept apart from
 * `planProducerOpening`, which never invents funding. The seed needs an
 * explicit approval reference and reports exactly what it creates per country.
 * Pure: plain data in, seed rows out.
 */

/** Turns of household spending seeded at the cutover. */
export const HOUSEHOLD_OPENING_TURNS = 3;

export interface HouseholdOpeningSource {
  walletId: string;
  countryId: string;
  currency: string;
  localPerAnchor: number;
  /** Today's household spending per turn in this wallet's scope, in anchor units. */
  perTurnSpendingAnchor: number;
}

export interface HouseholdOpeningSeed {
  walletId: string;
  countryId: string;
  currency: string;
  openingCashAnchor: number;
  openingCashLocal: number;
}

export function planHouseholdOpeningSeed(input: {
  wallets: readonly HouseholdOpeningSource[];
  approvalReference: string;
  turns?: number;
}): { seeds: HouseholdOpeningSeed[]; createdAnchor: number; approvalReference: string } {
  if (!input.approvalReference || !input.approvalReference.trim())
    throw new Error("Household opening cash requires an owner approval reference");
  const turns = input.turns ?? HOUSEHOLD_OPENING_TURNS;
  if (!Number.isFinite(turns) || turns < 0 || turns > 12)
    throw new Error("Invalid household opening turns");
  const seen = new Set<string>();
  const seeds: HouseholdOpeningSeed[] = [];
  for (const w of [...input.wallets].sort((a, b) => (a.walletId < b.walletId ? -1 : 1))) {
    if (!w.walletId || seen.has(w.walletId)) throw new Error("Duplicate household wallet");
    seen.add(w.walletId);
    if (!Number.isFinite(w.localPerAnchor) || w.localPerAnchor <= 0)
      throw new Error("Household wallet requires an observed currency rate");
    if (!Number.isFinite(w.perTurnSpendingAnchor) || w.perTurnSpendingAnchor < 0)
      throw new Error("Invalid household spending");
    const openingCashAnchor = w.perTurnSpendingAnchor * turns;
    seeds.push({
      walletId: w.walletId,
      countryId: w.countryId,
      currency: w.currency,
      openingCashAnchor,
      openingCashLocal: openingCashAnchor * w.localPerAnchor,
    });
  }
  return {
    seeds,
    createdAnchor: seeds.reduce((s, x) => s + x.openingCashAnchor, 0),
    approvalReference: input.approvalReference.trim(),
  };
}
