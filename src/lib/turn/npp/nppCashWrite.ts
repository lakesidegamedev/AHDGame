/**
 * Builds the corporation bulkWrite op for one NPP decision.
 *
 * `liquidCapital` is written twice per corporation turn into the SAME ordered
 * bulkWrite. `sectorCalculations` pushes operating income as
 * `$inc: { liquidCapital: incomeForBalance }`, then `corporation/index.ts`
 * APPENDS the NPP decision's ops. An ordered bulkWrite applies per-document ops
 * in array order, so anything the NPP writes lands last.
 *
 * The NPP decision therefore must never write `liquidCapital` absolutely: a
 * `$set` seeded from the pre-income read would overwrite the income credit and
 * the turn's entire operating income would vanish, since ANY placed build
 * assigns the field. Bond coupons and supply settlements survived only because
 * later phases apply them with their own `$inc` after the corporation turn.
 *
 * So the cash leg travels as a DELTA and is emitted as `$inc`, composing with
 * the income credit and every other phase rather than racing them. This is the
 * shape the tech-unlock path in `nppCorporationBehavior` uses
 * (`$inc: { liquidCapital: -cashCost }`), now the rule for every NPP cash
 * movement.
 */

import type { ObjectId } from "mongodb";
import type { NppCorpDecision } from "./corpDecisionTypes";

export type NppCorpUpdateOp = {
  filter: { _id: ObjectId; unlockedTechNodeIds?: { $ne: string } };
  update: {
    /** Omitted entirely when there is nothing to set — Mongo rejects `$set: {}`. */
    $set?: Record<string, unknown>;
    $inc?: Record<string, number>;
    $addToSet?: { unlockedTechNodeIds: string };
  };
};

/**
 * Turn a decision into its corporation op, or null when it changes nothing.
 *
 * The cash spend is gated separately from `updates` on purpose: with cash no
 * longer living in `updates`, a decision whose only effect is a spend would be
 * dropped by an `Object.keys(updates).length > 0` check.
 */
export function buildNppCorpUpdateOp(decision: NppCorpDecision): NppCorpUpdateOp | null {
  const delta = decision.liquidCapitalDelta ?? 0;
  // A non-finite `$inc` sets the field to NaN and poisons every later read of
  // it, so drop it rather than corrupt the balance (`sectorCalculations`
  // carries a guard comment about this exact class of write).
  //
  // NOT rounded: the balance is fractional throughout (sectorCalculations
  // `$inc`s raw `incomeForBalance`), and the ledger row records the exact
  // `costLocal`. Rounding here would drift cash out of step with its ledger row.
  const cashDelta = Number.isFinite(delta) ? delta : 0;
  const hasSet = Object.keys(decision.updates).length > 0;
  if (!hasSet && cashDelta === 0) return null;

  return {
    filter: { _id: decision.corpId },
    update: {
      // Mongo rejects an empty update operator ("'$set' is empty"), which
      // inside the corporation bulkWrite would throw and abort the turn. A
      // spend-only decision carries no field writes, so omit `$set` entirely.
      ...(hasSet ? { $set: decision.updates } : {}),
      ...(cashDelta !== 0 ? { $inc: { liquidCapital: cashDelta } } : {}),
    },
  };
}
