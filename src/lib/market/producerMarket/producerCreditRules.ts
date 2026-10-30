/**
 * Producer credit: a private company short of cash may still run its plants,
 * owing the wages and site bills it cannot pay this turn as producer payables.
 * Those payables are paid first out of the next turns' cash (see
 * settlePriorProducerPayables), so workers and site payees are paid late, never
 * with money that does not exist. Inputs are not bought on credit: suppliers
 * are paid in cash at clearing, so a company on credit buys only the inputs its
 * cash covers.
 *
 * The line is bounded two ways so a company selling below cost cannot pile up
 * debt without end:
 * - outstanding payables may not exceed PRODUCER_CREDIT_RUN_TURNS turns of its
 *   own wage and site bill at a full run;
 * - credit stops once its payables have gone PRODUCER_CREDIT_STUCK_TURNS turns
 *   without shrinking, and the company falls back to running on cash alone.
 *
 * State companies are not on this line: the treasury run advance funds them.
 *
 * Pure: plain data in, plain data out. Anchor units throughout.
 */

/** Outstanding payables may reach this many turns of the company's full wage and site bill. */
export const PRODUCER_CREDIT_RUN_TURNS = 2;

/** Credit stops after this many turns in which the company's payables did not shrink. */
export const PRODUCER_CREDIT_STUCK_TURNS = 4;

export interface ProducerCreditPolicy {
  /** Private companies allowed to run on credit. */
  accountIds: readonly string[];
  /** Override for PRODUCER_CREDIT_RUN_TURNS. */
  runTurns?: number;
  /** Override for PRODUCER_CREDIT_STUCK_TURNS. */
  stuckTurns?: number;
}

/**
 * How much more this company may owe this turn. Zero once its payables reach
 * the cap, or once they have gone `stuckTurns` turns without shrinking.
 */
export function producerCreditHeadroom(input: {
  turn: number;
  /** Wages at a full run plus site and regulatory bills, this turn. */
  billsAtFullRun: number;
  /** Payables still owed after this turn's opening cash paid what it could. */
  outstanding: number;
  /** Turn since which the company's payables have not shrunk; absent if not tracked yet. */
  notShrinkingSince?: number;
  runTurns?: number;
  stuckTurns?: number;
}): number {
  const runTurns = input.runTurns ?? PRODUCER_CREDIT_RUN_TURNS;
  const stuckTurns = input.stuckTurns ?? PRODUCER_CREDIT_STUCK_TURNS;
  if (!(runTurns > 0) || !(stuckTurns > 0)) return 0;
  if (input.notShrinkingSince != null && input.turn - input.notShrinkingSince >= stuckTurns)
    return 0;
  const room = runTurns * Math.max(0, input.billsAtFullRun) - Math.max(0, input.outstanding);
  return Number.isFinite(room) && room > 0 ? room : 0;
}

/**
 * Share of a full run a company can make on cash plus credit. Inputs (at the
 * bid ceiling) must be bought with cash; wages and site bills may fall short of
 * cash by up to `headroom`. Never below the cash-only share.
 */
export function creditRunShare(input: {
  /** Spendable cash after old bills were reserved. */
  cash: number;
  fixedBills: number;
  /** Wages at a full run. */
  labour: number;
  /** Inputs at a full run, priced at the bid ceiling, net of stock held. */
  inputs: number;
  headroom: number;
}): number {
  const cash = Math.max(0, input.cash);
  const need = input.labour + input.inputs;
  const cashOnly = need > 0 ? Math.min(1, Math.max(0, cash - input.fixedBills) / need) : 1;
  if (!(input.headroom > 0) || need <= 0) return cashOnly;
  const byCredit = (cash + input.headroom - input.fixedBills) / need;
  const byInputs = input.inputs > 0 ? cash / input.inputs : 1;
  const share = Math.min(1, byCredit, byInputs);
  return Number.isFinite(share) ? Math.max(cashOnly, share) : cashOnly;
}

/**
 * The turn since which a company's payables have not shrunk, stamped on its
 * closing claims. A company that paid down what it owed, or owed nothing at
 * the open, restarts the clock this turn.
 */
export function payablesNotShrinkingSince(input: {
  turn: number;
  openingOwed: number;
  closingOwed: number;
  priorSince?: number;
}): number {
  if (!(input.openingOwed > 0) || input.closingOwed < input.openingOwed * (1 - 1e-9))
    return input.turn;
  return Math.min(input.turn, input.priorSince ?? input.turn);
}
