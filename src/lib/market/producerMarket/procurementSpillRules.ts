/**
 * Procurement spill to households (funded-market cutover). A public buyer is
 * funded every turn with the plant share of an outlay the treasury already
 * destroyed. The goods it buys (healthcare, ordnance, network services) are
 * capacity bound, so most of that funding goes unfilled and used to be burned
 * at close: the state's spending never became demand anywhere.
 *
 * Here a share of what is left in a country's public wallet after the line
 * carry, transition support and decommission grants is paid to the households
 * of the same country, weighted by the wages each household wallet is paid.
 * Households then spend it next turn on whatever has supply.
 *
 * Nothing is minted: the money is the same funding, moved instead of burned,
 * and it never leaves its country. The funding joins (healthcare against the
 * health outlay, defense against the treasury mandatory payment) are both
 * inside the household transfer join (health, labor and treasury outlays).
 *
 * Pure: pools and wallets in, payments out. Amounts are anchor units.
 */
import { POOL_FLOAT_MARGIN } from "./transitionRules";

export const PROCUREMENT_SPILL_DEFAULT_SHARE = 1;

export interface SpillWallet {
  accountId: string;
  countryId: string;
  /** Wages planned to this wallet this turn, anchor. */
  wageBill: number;
}

export interface SpillPayment {
  countryId: string;
  accountId: string;
  amountAnchor: number;
}

function positive(x: number | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * Share x pool per country, split across that country's household wallets by
 * wage bill (evenly when no wallet has wages). A country with no household
 * wallet keeps its pool, which is then returned as before.
 */
export function procurementSpill(input: {
  poolByCountry: ReadonlyMap<string, number>;
  wallets: readonly SpillWallet[];
  share: number;
}): SpillPayment[] {
  const s = Math.min(1, Math.max(0, positive(input.share)));
  if (!(s > 0)) return [];
  const byCountry = new Map<string, SpillWallet[]>();
  for (const w of input.wallets) {
    const list = byCountry.get(w.countryId) ?? [];
    list.push(w);
    byCountry.set(w.countryId, list);
  }
  const out: SpillPayment[] = [];
  for (const [countryId, rawPool] of [...input.poolByCountry.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    // A hair under the pool, so float error never overdraws the wallet.
    const pool = positive(rawPool) * s * (1 - POOL_FLOAT_MARGIN);
    const wallets = [...(byCountry.get(countryId) ?? [])].sort((a, b) =>
      a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0
    );
    if (!(pool > 0) || wallets.length === 0) continue;
    const wageTotal = wallets.reduce((sum, w) => sum + positive(w.wageBill), 0);
    let paid = 0;
    wallets.forEach((w, i) => {
      const amount =
        i === wallets.length - 1
          ? Math.max(0, pool - paid)
          : wageTotal > 0
            ? (pool * positive(w.wageBill)) / wageTotal
            : pool / wallets.length;
      paid += amount;
      if (amount > 0) out.push({ countryId, accountId: w.accountId, amountAnchor: amount });
    });
  }
  return out;
}
