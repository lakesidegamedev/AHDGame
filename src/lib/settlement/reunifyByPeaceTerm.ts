/**
 * Settle the German Question from a peace TERM rather than a war's outcome.
 *
 * The ordinary road is `settleFrozenCrisisFromConflict`: the war is fought,
 * somebody wins, and a turn sweep reads the result. A `reunification` term is
 * the challenger asking for that outcome directly while the fighting is still
 * ongoing, so settlement happens when the term is APPLIED, not on a later tick.
 *
 * Synchronous for the same reason the dictate route applies its term
 * synchronously: a player who just agreed to reunification should not load a
 * map still showing two Germanies until the next hour turns.
 *
 * ALWAYS THE CHALLENGER'S OUTCOME, whoever proposed the term. Either founding
 * belligerent may put a reunification on the table, from the incumbent it is a
 * capitulation, but the settled outcome does not change with the sender. The
 * outcome is hardcoded here rather than passed in so a future caller cannot
 * quietly hand the question to the incumbent instead.
 */
import type { Db } from "mongodb";
import type { SettlementCrisisDoc } from "@/lib/db/types/settlementCrisis";
import { getSettlementCrisesCollection } from "@/lib/db/collections";
import { actuateSettlementOutcome } from "@/lib/settlement/actuate";
import { emitSettlementWire } from "@/lib/settlement/emitWire";

export interface ReunifyByTermResult {
  actuated: boolean;
  /**
   * True when the crisis was CLAIMED and its consequences then did not complete.
   *
   * Distinct from "nothing to do". A half-done settlement IS recoverable now --
   * actuation holds a lease and stamps completion only at the end, so the next
   * turn sweep finds it un-actuated and resumes -- but that is the next tick, not
   * this request. The caller is being told its own attempt did not finish.
   */
  deferred: boolean;
  error?: string;
}

/** Nothing was claimed, so nothing is half-done. */
const NOT_ACTUATED: ReunifyByTermResult = { actuated: false, deferred: false };

export async function reunifyByPeaceTerm(
  db: Db,
  conflictId: string,
  currentTurn: number
): Promise<ReunifyByTermResult> {
  const crises = await getSettlementCrisesCollection(db);
  const crisis = await crises.findOne({
    conflictId,
    status: "frozen",
    // Scoped exactly as `loadTermSettlement` scopes the check that authorised this.
    // A validator and an applier that disagree about which crisis they mean is how a
    // term gets approved against one document and applied to another.
    kind: "settlement.germanQuestion",
  } as Parameters<typeof crises.findOne>[0]);
  // No question on this war is not an error here. `validatePeaceTerm` already refused
  // the term for exactly this case; reaching it means the crisis moved between the
  // check and the apply, and the right answer is to change nothing.
  if (!crisis) return NOT_ACTUATED;

  // Guarded on `frozen`, the same claim `settleFrozenCrisisFromConflict` makes: the
  // actuation this unlocks is not replayable, and a turn sweep can be running against
  // this document at the same moment as the request that got here.
  const claimed = await crises.updateOne(
    { _id: crisis._id, status: "frozen" },
    {
      $set: {
        status: "resolved",
        outcome: "challenger",
        resolvedTurn: currentTurn,
        updatedAt: new Date(),
      },
    }
  );
  if (claimed.matchedCount !== 1) return NOT_ACTUATED;

  // The CLAIMED document, not the one read above. `actuateSettlementOutcome` refuses
  // anything that is not already `resolved` with an outcome, so passing the frozen
  // copy would claim the crisis and then quietly actuate nothing.
  const resolved: SettlementCrisisDoc = {
    ...crisis,
    status: "resolved",
    outcome: "challenger",
    resolvedTurn: currentTurn,
  };
  const result = await actuateSettlementOutcome(db, resolved, currentTurn);

  // FILE THE DISPATCH HERE: `settlementPhase` only announces settlements it
  // actuates, and its sweep skips anything with `actuationCompletedTurn` set,
  // which this path just wrote. Without this the crisis goes unannounced.
  //
  // Safe from a request path: `emitSettlementWire` claims `postedWireEvents`
  // with a `$ne` guard before sending, so retries are no-ops.
  //
  // Gated on `actuated` so a failed half-run cannot post. Uses the RESOLVED
  // document because the copy branches on the outcome.
  if (result.actuated) {
    await emitSettlementWire(db, resolved, currentTurn, { events: ["settled"] });
    return { actuated: true, deferred: false };
  }

  // LOUD, because nothing else will say it HERE. On the turn road a failed
  // actuation at least shows up in the phase's result; this runs inside a request
  // whose caller discards the outcome. The settlement is not lost -- no completion
  // was stamped, so the next sweep resumes it and announces it then -- but that is
  // an hour away and invisible until it happens, so the attempt is logged now.
  console.error(
    `[Settlement] reunification by peace term did not complete for ${conflictId}:`,
    result.error ?? "no reason given"
  );
  return { actuated: false, deferred: true, error: result.error };
}
