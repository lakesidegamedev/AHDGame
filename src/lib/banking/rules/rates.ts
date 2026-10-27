/**
 * Effective bank rates from the policy rate and the CEO's offsets. The shell
 * (`banking/rates.ts`) validates offsets against the Regulation Q corridor and
 * persists them.
 */

import type { BankCharter } from "@/lib/db/types/bank";
import type { RateCorridor } from "@/lib/banking/separationLaw";
import { savingsApyPercent } from "@/lib/currency/savingsInterest";

/** Floor on effective deposit rate (percent). Provisional - flagged for user review. */
export const MIN_DEPOSIT_RATE_PERCENT = 0.05;

/** Floor on effective lending rate (percent). Provisional - flagged for user review. */
export const MIN_LENDING_RATE_PERCENT = 0.1;

/** New charters start halfway through the legal corridor rather than at its edge. */
export function startingBankOffsets(corridors: {
  deposit: RateCorridor;
  lending: RateCorridor;
}): Pick<BankCharter, "depositOffset" | "lendingOffset"> {
  return {
    depositOffset: (corridors.deposit.minOffset + corridors.deposit.maxOffset) / 2,
    lendingOffset: (corridors.lending.minOffset + corridors.lending.maxOffset) / 2,
  };
}

/**
 * Effective deposit and lending rates = prime + offsets, floored at the
 * module minimums. A missing or non-finite prime reads as zero.
 */
export function effectiveBankRatesFromPrime(
  charter: Pick<BankCharter, "depositOffset" | "lendingOffset">,
  primeRateRaw: number | undefined | null
): { depositRatePercent: number; lendingRatePercent: number } {
  const primeRate =
    typeof primeRateRaw === "number" && Number.isFinite(primeRateRaw) ? primeRateRaw : 0;
  return {
    depositRatePercent: Math.max(MIN_DEPOSIT_RATE_PERCENT, primeRate + charter.depositOffset),
    lendingRatePercent: Math.max(MIN_LENDING_RATE_PERCENT, primeRate + charter.lendingOffset),
  };
}

/**
 * Rate the bank pays this turn on player savings balances.
 *
 * An authoritative currency pays the full posted rate: the backing cash is in
 * the vault and the liability is real. Any other currency pays only the
 * premium over the CB base APY, because the pointer balance never arrived as
 * cash; the base accrues to the saver in savingsInterestTurn instead.
 * Floored at zero so a posted rate below base pays nothing rather than
 * charging the saver.
 */
export function playerDepositRatePercent(
  depositRatePercent: number,
  playerDepositsAreLiabilities: boolean,
  primeRate: number,
  inflationRate: number
): number {
  if (playerDepositsAreLiabilities) return depositRatePercent;
  const base = savingsApyPercent(
    typeof primeRate === "number" && Number.isFinite(primeRate) ? primeRate : 0,
    typeof inflationRate === "number" && Number.isFinite(inflationRate) ? inflationRate : 0
  );
  return Math.max(0, depositRatePercent - base);
}

/**
 * Whether a charter can hold a player's savings in `currency`: active, in that
 * currency, and deposit-taking. Any other holder pointer is stale and earns no
 * bank premium.
 */
export function holdsPlayerSavings(
  charter: Pick<BankCharter, "status" | "currency" | "type"> | null | undefined,
  currency: string
): boolean {
  return (
    charter?.status === "active" &&
    charter.currency === currency &&
    (charter.type === "retail" || charter.type === "universal")
  );
}

/**
 * Total APY a saver earns with a private bank as savings holder. Outside an
 * authoritative currency the bank pays only its premium
 * ({@link playerDepositRatePercent}) and savingsInterestTurn still pays the CB
 * base on the balance, so the two add up.
 */
export function privateHolderSavingsApyPercent(
  depositRatePercent: number,
  playerDepositsAreLiabilities: boolean,
  primeRate: number,
  inflationRate: number,
  centralBankApyPercent: number
): number {
  const bankRate = playerDepositRatePercent(
    depositRatePercent,
    playerDepositsAreLiabilities,
    primeRate,
    inflationRate
  );
  return bankRate + (playerDepositsAreLiabilities ? 0 : centralBankApyPercent);
}
