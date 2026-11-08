import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { SEED_UPKEEP_TARGET_SHARE } from "@/lib/military/appropriation";
import { defenceSupplierCapShare } from "@/lib/military/defenceContractLimits";

/**
 * Turns of procurement income the appropriation may pay out in a single turn.
 *
 * Bounds the RATE at which awarded defence contracts settle. A contract credits
 * the supplier the near-total margin of the price, so without a rate cap one
 * supplier can drain the whole quarterly window in a single tick.
 *
 * Three times the per-turn accrual, so over a 12-turn window the allowance sums
 * to three times the award quota: it cannot reduce what a legitimate buyer spends
 * across a window, only stop the quota landing in one or two turns.
 */

/**
 * Turns of procurement income the appropriation may pay out in a single turn.
 *
 * Three rather than one because a country that has been saving must be able to spend the
 * stockpile faster than it earned it, which is the whole point of holding a balance. Three
 * rather than twelve because at twelve the cap is the window quota again and bounds nothing.
 */
export const DEFENCE_TURN_SPEND_BURST = 3;

/**
 * The procurement half of one turn's defence income.
 *
 * Deliberately the same identity `defenceContractLotCaps` uses for a whole window, divided by
 * the window length, so the award quota and the payout cap can never drift apart: upkeep takes
 * `SEED_UPKEEP_TARGET_SHARE` and procurement gets the rest.
 */
export function defenceProcurementAccrualPerTurn(defenceLine: number): number {
  if (!(defenceLine > 0)) return 0;
  return (defenceLine * (1 - SEED_UPKEEP_TARGET_SHARE)) / TURNS_PER_YEAR;
}

/** Most the whole appropriation may pay suppliers this turn. */
export function defenceCountryTurnSpendCap(defenceLine: number): number {
  return defenceProcurementAccrualPerTurn(defenceLine) * DEFENCE_TURN_SPEND_BURST;
}

/**
 * Most ONE supplier may be paid this turn.
 *
 * Reuses the award side's share so the two caps say the same thing about who may take how
 * much: a third of the country for private industry, all of it for a National Corporation,
 * which has no player CEO to enrich (ticket #1134).
 */
export function defenceSupplierTurnSpendCap(defenceLine: number, stateOwned: boolean): number {
  return defenceCountryTurnSpendCap(defenceLine) * defenceSupplierCapShare(stateOwned);
}

/**
 * Lots this contract may settle now, given what the country and the supplier have
 * already been paid this turn.
 *
 * The one-lot floor is anti-deadlock: a small country whose lot price exceeds its
 * turn cap would otherwise never ship. It is per COUNTRY per turn, not per contract,
 * so awarding many contracts cannot ship many free lots. Nothing has been paid yet
 * when it applies, so it cannot stack.
 */
export function lotsWithinTurnSpendCap(input: {
  pricePerLot: number;
  countryTurnCap: number;
  supplierTurnCap: number;
  countryPaidThisTurn: number;
  supplierPaidThisTurn: number;
}): number {
  const { pricePerLot, countryPaidThisTurn } = input;
  if (!(pricePerLot > 0)) return Number.POSITIVE_INFINITY;
  const remaining = Math.min(
    input.countryTurnCap - countryPaidThisTurn,
    input.supplierTurnCap - input.supplierPaidThisTurn
  );
  // Nudge by a relative epsilon before flooring. The accrual is a chain of float divisions
  // (48e9 x 0.45 / 48 lands on 449999999.99999994, not 450000000), so a supplier sitting
  // exactly on its cap would otherwise lose a whole lot to representation error.
  const lots = remaining > 0 ? Math.floor(remaining / pricePerLot + 1e-9) : 0;
  if (lots > 0) return lots;
  return countryPaidThisTurn <= 0 ? 1 : 0;
}
