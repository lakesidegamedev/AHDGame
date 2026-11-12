/**
 * Commit one play: validate, take the guarded debit, charge the treasury,
 * insert. Order is the correctness story.
 *
 * Both debits are guarded `$inc`s whose filter restates the precondition, so a
 * double-submit races on the write, not the read, and the loser spends nothing.
 *
 * NOT ATOMIC across the three writes; this repo does not use Mongo transactions
 * on player action paths. Failure modes:
 *   - guarded claim fails   → nothing spent or queued. Safe; the only outcome a
 *                             concurrent double-submit can produce.
 *   - `spendFromTreasury` throws → AP and capital gone, no play.
 *   - `insertOne` throws    → AP, capital, treasury gone, no play.
 * The last two require a DB outage mid-request. Money always moves before the
 * effect exists, so a player can be over-charged and refunded but never get a
 * free play. If transactions are ever added, wrap claim through insert.
 *
 * ONE EXCEPTION: on the personal path, a duplicate-key rejection from the
 * once-per-turn index is refunded because there is no effect to have paid for.
 */
import { ObjectId, type Db } from "mongodb";
import type { SettlementPaymentMode, SettlementPlayDoc } from "@/lib/db/types/settlementPlay";
import { capitalPriceFor } from "../capitalPrice";
import { getPlay, PERSONAL_PLAY_USES_PER_TURN } from "@/lib/constants/settlementCrisis";
import type { CountryId } from "@/lib/constants/countries";
import { getSettlementCrisesCollection, getSettlementPlaysCollection } from "@/lib/db/collections";
import { spendFromTreasury } from "@/lib/budget/treasurySpend";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { loadSettlementActorContext } from "../actorContext";
import { resolvePersonalFunds, seatFundsLocal } from "../playCost";
import { charactersCollection } from "@/lib/db/repositories/characters";

export interface CommitPlayInput {
  characterId: ObjectId;
  actor: "seat" | "personal";
  playId: string;
  /** Required for a personal play; ignored on a seat play. */
  direction?: 1 | -1;
  /**
   * Which budget pays. Defaults to `"funds"` so a client posting the old body
   * keeps working AND keeps paying cash — silently switching an old client to
   * capital would spend a budget the player never agreed to spend.
   */
  payment?: SettlementPaymentMode;
}

export type CommitPlayResult =
  | { ok: true; playId: string; appliedDirection: 1 | -1 }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): CommitPlayResult => ({ ok: false, status, error });

/**
 * A write the `settlementPlays_personal_once` index rejected.
 *
 * Matched on the code rather than the message: 11000 is the duplicate-key
 * error, and the only unique constraint on this collection is the once-per-turn
 * allowance, so any duplicate reaching the personal insert is that one.
 */
function isDuplicatePersonalPlay(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

export async function commitSettlementPlay(
  db: Db,
  input: CommitPlayInput
): Promise<CommitPlayResult> {
  const play = getPlay(input.playId);
  if (!play) return fail(400, "No such play.");

  const payment: SettlementPaymentMode = input.payment ?? "funds";
  if (payment === "capital") {
    if (input.actor === "personal") {
      return fail(400, "A personal play has no delegation capital to spend.");
    }
    if (play.fundsCost === 0) {
      return fail(400, "That play has no treasury cost to pay another way.");
    }
  }
  // ADDS to the play's own capital cost, so paying this way is never cheaper in
  // capital than paying cash. The route buys a delegation out of indebting the
  // nation; it is not a discount.
  const capitalCharged = payment === "capital" ? capitalPriceFor(play) : play.capitalCost;

  const ctx = await loadSettlementActorContext(db, input.characterId);
  if (!ctx.crisisId) return fail(404, "No settlement crisis is open.");

  const crises = await getSettlementCrisesCollection(db);
  const crisisId = new ObjectId(ctx.crisisId);
  const crisis = await crises.findOne({ _id: crisisId });
  if (!crisis) return fail(404, "No settlement crisis is open.");
  if (crisis.status !== "open") {
    return fail(409, "The crisis is frozen while the war it started is fought.");
  }

  const turn = await getCurrentTurn(db);
  const now = new Date();
  // Annotated, not inferred: this is every field of the row EXCEPT the ones the
  // two branches below differ on, so the compiler checks completeness here and
  // neither `insertOne` needs a cast that could assert a missing field away.
  const base: Omit<SettlementPlayDoc, "_id" | "actor" | "seatId" | "countryId" | "direction"> = {
    crisisId,
    characterId: input.characterId,
    playId: play.id,
    targetInstitutionId: play.target,
    class: play.class,
    costs: { funds: play.fundsCost, capital: capitalCharged, actions: play.actionCost },
    payment,
    basePoints: play.magnitude,
    appliedPoints: null,
    heatAdded: play.addsHeat ? 1 : 0,
    turn,
    resolvedTurn: null,
    createdAt: now,
  };

  const plays = await getSettlementPlaysCollection(db);

  if (input.actor === "seat") {
    if (play.seat === null) return fail(403, "That play is not a delegation's to make.");
    const seat = ctx.seat;
    if (!seat) return fail(403, "You hold no delegation on this question.");
    if (play.seat !== seat.id) return fail(403, "That play belongs to another delegation.");
    if (seat.direction === null) {
      return fail(409, "Your country belongs to neither bloc, so it has no side to push for.");
    }

    // NO treasury pre-check. `treasuryBalance` is the SIGNED national cash
    // position, so a `balance < cost` guard would refuse every funded play
    // for a country already carrying a cash hole.
    //
    // `spendFromTreasury` is built to borrow: it splits a spend into
    // fromSurplus and addedToDebt, and its contract says the treasury "is
    // allowed to go negative, that is national debt". Borrowing is modelled
    // through interestRate, creditRating and debtToGdpRatio: a consequence,
    // not a refusal. Capital mode pays nothing from the treasury.
    const fundsLocal = payment === "capital" ? 0 : seatFundsLocal(play);

    // Guarded debit. The filter restates the budget the context reported, so a
    // second submit racing this one matches nothing and pays nothing. It has to
    // restate the CHARGED capital, not the catalogue's, or a capital-route play
    // would be claimed against the cheaper cash price.
    const claimed = await crises.updateOne(
      {
        _id: crisisId,
        status: "open",
        seats: {
          $elemMatch: {
            id: seat.id,
            capital: { $gte: capitalCharged },
            actions: { $gte: play.actionCost },
          },
        },
      },
      {
        $inc: {
          "seats.$.capital": -capitalCharged,
          "seats.$.actions": -play.actionCost,
        },
        $set: { updatedAt: now },
      }
    );
    if (claimed.matchedCount !== 1) {
      return fail(409, "Your delegation's budget changed before the play landed. Try again.");
    }

    // AFTER the claim: the claim is what makes this single-writer, so charging
    // first would let a losing race still spend the treasury.
    if (fundsLocal > 0) {
      await spendFromTreasury(db, seat.id as CountryId, fundsLocal, {
        witness: {
          flow: "settlement_play",
          key: `settlement-play:${play.id}:${seat.id}`,
          site: "settlement/commitPlay",
        },
      });
    }

    await plays.insertOne({
      ...base,
      _id: new ObjectId(),
      actor: "seat",
      seatId: seat.id,
      countryId: seat.id as CountryId,
      direction: seat.direction,
      // Record what was ACTUALLY charged. On the capital route that is zero
      // money, and the audit trail has to match the balance the player watched.
      costs: { ...base.costs, funds: fundsLocal },
    });
    return { ok: true, playId: play.id, appliedDirection: seat.direction };
  }

  // ── personal ──────────────────────────────────────────────────────────────
  if (play.seat !== null) return fail(403, "That play is a delegation's, not yours to make.");
  if (input.direction !== 1 && input.direction !== -1) {
    return fail(400, "Choose which way to push.");
  }

  // The allowance is a COUNT OF THIS TURN'S ROWS, not a stored counter, so it
  // resets with the turn on its own: nothing to clear, nothing to migrate, and
  // no way for it to drift out of step with what was actually played.
  //
  // Enforced here and not only on the board: this route spends a budget, and a
  // client can post whatever it likes. Checked BEFORE any debit, so a refused
  // play never costs a player anything.
  const usedThisTurn = await plays.countDocuments({
    crisisId,
    turn,
    characterId: input.characterId,
    playId: play.id,
    actor: "personal",
  });
  if (usedThisTurn >= PERSONAL_PLAY_USES_PER_TURN) {
    return fail(409, "You have already used this play this turn. It resets next turn.");
  }

  const character = await charactersCollection(db).findOne({ _id: input.characterId });
  if (!character) return fail(404, "Character not found.");

  const funds = await resolvePersonalFunds(db, character, play);

  const debited = await charactersCollection(db).updateOne(
    {
      _id: input.characterId,
      actions: { $gte: play.actionCost },
      [funds.field]: { $gte: funds.local },
    },
    {
      $inc: { actions: -play.actionCost, [funds.field]: -funds.local },
      $set: { updatedAt: now },
    }
  );
  if (debited.matchedCount !== 1) {
    return fail(409, "Your actions or funds changed before the play landed. Try again.");
  }

  try {
    await plays.insertOne({
      ...base,
      _id: new ObjectId(),
      actor: "personal",
      seatId: null,
      countryId: null,
      direction: input.direction,
      // Record what was ACTUALLY charged, not the anchor figure — the audit
      // trail has to match the balance the player watched go down.
      costs: { ...base.costs, funds: funds.local },
    });
  } catch (error) {
    // The unique partial index is the BACKSTOP for the allowance. The count
    // above and this insert are not atomic, so two fast clicks can both read
    // zero and both arrive here; the second one loses on the index instead of
    // buying a second use.
    if (!isDuplicatePersonalPlay(error)) throw error;
    // The debit already happened, so give it back. This is the one place the
    // file's usual ordering — money moves before the effect exists — has to be
    // undone, because there IS no effect to pay for.
    await charactersCollection(db).updateOne(
      { _id: input.characterId },
      {
        $inc: { actions: play.actionCost, [funds.field]: funds.local },
        $set: { updatedAt: new Date() },
      }
    );
    return fail(409, "You have already used this play this turn. It resets next turn.");
  }
  return { ok: true, playId: play.id, appliedDirection: input.direction };
}
