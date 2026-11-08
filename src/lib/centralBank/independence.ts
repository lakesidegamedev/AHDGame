/**
 * Central bank independence fight.
 *
 * Two government takeovers must be expensive:
 *  - **Dismissing the chair.** Takes ALL of the institution's scrutiny plus
 *    more (DISMISSAL_SCRUTINY). Making it equal to a resignation would let
 *    the government fire and reinstall the chair cheaply. Firing is strictly
 *    worse than waiting a term out.
 *  - **Revoking independence by statute.** Flips `governmentControlled` and
 *    posts news; the statute costs legislative votes but the bank's word
 *    was costing nothing. Revoking now adds scrutiny.
 *
 * Granting independence pays NOTHING back; otherwise grant-revoke cycling
 * becomes a laundromat. Scrutiny only decays via correct stances over time.
 */

import type { CentralBank } from "@/lib/db/types/centralBank";

/**
 * Scrutiny added when the executive dismisses a sitting chair before their term
 * ends. Larger than `INTERFERENCE_SCRUTINY` (12): overriding one rate decision
 * is a disagreement, removing the person who makes them is a statement about
 * who the bank answers to.
 */
export const DISMISSAL_SCRUTINY = 18;

/**
 * Scrutiny added when a statute revokes the bank's operational independence.
 * Larger again: a law outlasts the government that passed it.
 */
export const REVOCATION_SCRUTINY = 22;

/**
 * Scrutiny after a dismissal.
 *
 * Note what is NOT here: the `CHAIR_CHANGE_SCRUTINY_RETAINED` multiplier that
 * every other vacancy path applies. A dismissal must never be a cheaper way to
 * shed scrutiny than letting a term run out, so the institution keeps the lot
 * and takes the penalty on top.
 */
export function scrutinyAfterDismissal(bank: Pick<CentralBank, "chairInfamy">): number {
  const current = Math.max(0, Math.min(100, bank.chairInfamy ?? 0));
  return Math.min(100, current + DISMISSAL_SCRUTINY);
}

/** Scrutiny after a statutory revocation of independence. */
export function scrutinyAfterRevocation(bank: Pick<CentralBank, "chairInfamy">): number {
  const current = Math.max(0, Math.min(100, bank.chairInfamy ?? 0));
  return Math.min(100, current + REVOCATION_SCRUTINY);
}

/**
 * The three ways a government can take a bank, and what each costs it, for the
 * UI. Published as data so the card and the wiki cannot drift from the engine.
 */
export const INDEPENDENCE_COSTS: ReadonlyArray<{
  action: string;
  scrutiny: number;
  note: string;
}> = [
  {
    action: "Set the rate directly",
    scrutiny: 12,
    note: "Available only while the bank is government-controlled.",
  },
  {
    action: "Dismiss the chair",
    scrutiny: DISMISSAL_SCRUTINY,
    note: "The institution keeps all of its existing scrutiny — unlike a resignation or an expired term.",
  },
  {
    action: "Revoke independence by statute",
    scrutiny: REVOCATION_SCRUTINY,
    note: "Needs the votes. Granting independence back refunds nothing.",
  },
];
