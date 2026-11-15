import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

/**
 * The share of its appropriation a country's SEEDED order of battle consumes in upkeep.
 *
 * The single balance dial in this system — the per-country table beside it
 * (`seedRosterUpkeep.ts`) holds measured facts only, so this is the one number to move if
 * standing forces feel too cheap or too expensive.
 *
 * Read it as: a nation at its historical starting force spends 55% of its defence budget
 * sustaining that force, leaving 45% for procurement. Double the roster and upkeep is 110%
 * of the budget — the overdraft, and then arrears.
 */
export const SEED_UPKEEP_TARGET_SHARE = 0.55;

/** A turn's income: the annual defence line spread over the game year. */
export function accrualPerTurn(defenseLine: number): number {
  return defenseLine > 0 ? defenseLine / TURNS_PER_YEAR : 0;
}

/**
 * What the standing force costs this turn, in absolute local currency.
 *
 * `upkeepBase` is an abstract unit, not money, so measure against the
 * appropriation envelope, not GDP: defence-line-to-GDP ratios swing hugely
 * across eras, so a GDP-keyed divisor works in one era and not the next.
 *
 * `totalUpkeep` and `seedRosterUpkeep` are both `aggregateForce().totalUpkeep`,
 * so MILITARY_COUNTRY_SCALE and posture/tier multipliers cancel. Never
 * re-apply the country scale here; that double-scales RU by 2.4x.
 *
 * Returns 0 on unusable input rather than throwing: this is a per-turn sweep
 * over every country, so a data gap must not take down the turn loop, and an
 * invented charge would put a nation into arrears over a missing table entry.
 */
export function upkeepPerTurn(
  totalUpkeep: number,
  seedRosterUpkeep: number,
  defenseLine: number
): number {
  if (!(seedRosterUpkeep > 0) || !(defenseLine > 0)) return 0;
  return accrualPerTurn(defenseLine) * SEED_UPKEEP_TARGET_SHARE * (totalUpkeep / seedRosterUpkeep);
}

/**
 * How far the pot may go negative: one year's accrual, i.e. the whole annual line.
 *
 * Returned POSITIVE; the balance floor is its negation. A country with no usable defence
 * line gets a floor of 0 and therefore cannot borrow at all, which is correct — there is no
 * appropriation to borrow against.
 */
export function overdraftFloor(defenseLine: number): number {
  return defenseLine > 0 ? defenseLine : 0;
}

export interface AppropriationSettlement {
  /** Closing balance after accrual and whatever upkeep could be funded. */
  balance: number;
  /**
   * The NET change this turn (`accrual − paid`), which is what the persist path applies.
   *
   * The absolute `balance` above is for reporting only. Writing it back would be a
   * read-modify-write over money: a player recruiting between this step's read and its write
   * has their debit silently reverted by the absolute value, minting the unit for free. The
   * delta is applied as an atomic `$inc` instead, so concurrent spends compose.
   */
  delta: number;
  /** Upkeep actually funded this turn. */
  paid: number;
  /** How much further below zero the balance went — drawn as national debt. */
  overdraftDrawn: number;
  /** 0..1 share of this turn's upkeep left unfunded. */
  arrearsRatio: number;
}

/**
 * Credit the turn's accrual, then fund as much upkeep as the balance and the overdraft
 * allow.
 *
 * Upkeep is funded continuously rather than all-or-nothing: it is an obligation already
 * incurred, not a purchase, so it is paid down to the exact floor and only the remainder
 * becomes arrears. That also makes the arrears ratio a smooth signal — a force 10% beyond
 * its budget sags slightly rather than collapsing.
 */
export function settleAppropriation(
  opening: number,
  accrual: number,
  upkeep: number,
  floor: number
): AppropriationSettlement {
  const afterAccrual = opening + accrual;
  const minBalance = -Math.max(0, floor);
  const payable = Math.max(0, afterAccrual - minBalance);
  const due = Math.max(0, upkeep);
  const paid = Math.min(due, payable);
  const balance = afterAccrual - paid;
  // Only the increase in the negative position is a NEW treasury draw. An opening balance
  // already below zero was borrowed for in an earlier turn. Comparing with afterAccrual
  // charged the entire current upkeep again whenever the pot started negative, even when
  // this turn's accrual covered it and the pot was moving back toward zero.
  const overdraftDrawn = Math.max(0, Math.max(0, -balance) - Math.max(0, -opening));
  const arrearsRatio = due > 0 ? (due - paid) / due : 0;
  return { balance, delta: accrual - paid, paid, overdraftDrawn, arrearsRatio };
}

/**
 * Share of a turn's defence income the standing force consumes. Reduces to
 * SEED_UPKEEP_TARGET_SHARE × (liveRoster / seedRoster).
 *
 * The defence line CANCELS: upkeep is itself accrual × 0.55 × (live/seed), so
 * dividing by accrual leaves 0.55 × (live/seed) whatever the accrual magnitude.
 * This measures the force against its own seeded order of battle, not the
 * budget: growing or gutting the defence line does not move this, only a
 * zero line does (a cliff to null). Because upkeep is defined against your own
 * accrual, zeroing the line zeroes upkeep and never produces arrears.
 *
 * Returns null (not 0) when there is no usable defence line: 0 would read as
 * "this force is free," the most positive signal. Absent means the metric
 * contributes nothing.
 */
export function upkeepBurden(upkeep: number, accrual: number): number | null {
  if (!(accrual > 0)) return null;
  return Math.max(0, upkeep) / accrual;
}
