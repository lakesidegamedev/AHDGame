/**
 * Cabinet nomination choice
 *
 * A nominee can win the Senate vote and still be barred from the seat by a
 * central bank office (see requiresCabinetIndependence). Rather than reject the
 * appointment in silence, the lifecycle offers the nominee the seat: take it
 * and give up the bank office, or stay where they are. This module reads,
 * resolves and lapses those offers.
 */
import type { AnyBulkWriteOperation, Db, ObjectId } from "mongodb";
import type { CabinetNomination, Character } from "@/lib/db/types";
import type { CentralBank } from "@/lib/db/types/centralBank";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { getCabinetPositionById } from "@/lib/constants";
import { vacateFomcChairSeat } from "@/lib/centralBank/helpers";

/** Turns a nominee has to answer before the offer lapses. */
export const CABINET_NOMINATION_CHOICE_TURNS = 3;

export type CabinetChoiceDecision = "accept" | "remain";

function positionName(positionId: string): string {
  return getCabinetPositionById(positionId)?.name ?? positionId;
}

/** The offer still open for this character, if any. */
export async function findPendingCabinetNominationChoice(
  db: Db,
  characterId: ObjectId,
  currentTurn: number
): Promise<CabinetNomination | null> {
  const nomination = await db.collection<CabinetNomination>("cabinetNominations").findOne({
    nomineeCharacterId: characterId,
    status: "awaiting_choice",
  });
  if (!nomination) return null;
  if (nomination.choiceExpiresOnTurn != null && nomination.choiceExpiresOnTurn <= currentTurn) {
    return null;
  }
  return nomination;
}

/** Plain-language name of the bank office blocking the appointment. */
export async function describeBankOfficeConflict(db: Db, characterId: ObjectId): Promise<string> {
  const chair = await db
    .collection<CentralBank>("centralBanks")
    .findOne({ chairCharacterId: characterId });
  if (chair) return "central bank chair";
  const boardSeat = await db.collection<CentralBank>("centralBanks").findOne({
    fomcBoard: { $elemMatch: { occupantType: "player", characterId } },
  });
  return boardSeat ? "Federal Reserve board seat" : "central bank office";
}

export interface ResolveCabinetNominationChoiceInput {
  nominationId: ObjectId;
  characterId: ObjectId;
  decision: CabinetChoiceDecision;
  now: Date;
  currentTurn: number;
}

export interface ResolveCabinetNominationChoiceResult {
  ok: boolean;
  error?: string;
}

/**
 * Apply the nominee's answer.
 *
 * "remain" rejects the nomination with the bank-office reason. "accept" gives
 * up every incompatible bank office and puts the nomination back in front of
 * the normal confirmation path, which seats the member on the next turn.
 */
export async function resolveCabinetNominationChoice(
  db: Db,
  input: ResolveCabinetNominationChoiceInput
): Promise<ResolveCabinetNominationChoiceResult> {
  const nomination = await db.collection<CabinetNomination>("cabinetNominations").findOne({
    _id: input.nominationId,
    status: "awaiting_choice",
  });
  if (!nomination) return { ok: false, error: "That offer is no longer open." };
  if (nomination.nomineeCharacterId?.toString() !== input.characterId.toString()) {
    return { ok: false, error: "That offer is not yours to answer." };
  }
  if (
    nomination.choiceExpiresOnTurn != null &&
    nomination.choiceExpiresOnTurn <= input.currentTurn
  ) {
    return { ok: false, error: "That offer has expired." };
  }

  const posName = positionName(nomination.positionId);
  const nomineeChar = await db
    .collection<Character>("characters")
    .findOne({ _id: input.characterId });
  const presidentChar = await db
    .collection<Character>("characters")
    .findOne({ _id: nomination.proposedByPresidentId });
  const isSameAsPresident =
    !!nomineeChar && nomineeChar._id.toString() === nomination.proposedByPresidentId.toString();
  const notifications: NotificationInput[] = [];

  if (input.decision === "remain") {
    await db.collection<CabinetNomination>("cabinetNominations").updateOne(
      { _id: nomination._id, status: "awaiting_choice" },
      {
        $set: {
          status: "rejected",
          rejectedAt: input.now,
          updatedAt: input.now,
          rejectionReason: "incompatible_bank_office",
        },
        $unset: { choiceOfferedAt: "", choiceExpiresOnTurn: "" },
      }
    );

    if (presidentChar?.userId) {
      notifications.push({
        userId: presidentChar.userId,
        type: "system",
        title: "Cabinet Nomination Rejected",
        message: `${nomination.nomineeCharacterName} chose to keep their central bank office, so the appointment to ${posName} cannot go ahead. You can nominate someone else.`,
        metadata: {
          nominationId: nomination._id.toString(),
          type: "cabinet_rejected",
          recipientCharacterId: presidentChar._id.toString(),
          rejectionReason: "incompatible_bank_office",
        },
      });
    }
    if (nomineeChar?.userId && !isSameAsPresident) {
      notifications.push({
        userId: nomineeChar.userId,
        type: "system",
        title: "Cabinet Nomination Rejected",
        message: `You chose to keep your central bank office, so you were not appointed ${posName}.`,
        metadata: {
          nominationId: nomination._id.toString(),
          type: "cabinet_rejected",
          recipientCharacterId: nomineeChar._id.toString(),
          rejectionReason: "incompatible_bank_office",
        },
      });
    }
    if (notifications.length > 0) await createNotifications(notifications);
    return { ok: true };
  }

  // Accept: stand down from the bank office(s) that bar a cabinet seat. This
  // mirrors the chair resignation route, plus any US Fed board seat held.
  const chairBank = await db
    .collection<CentralBank>("centralBanks")
    .findOne({ chairCharacterId: input.characterId });
  if (chairBank) {
    await db
      .collection("characters")
      .updateOne(
        { _id: input.characterId, "currentOffice.type": "centralBankChair" },
        { $set: { currentOffice: null } }
      );
    await vacateFomcChairSeat(db, chairBank._id);
    await db.collection<CentralBank>("centralBanks").updateOne(
      { _id: chairBank._id },
      {
        $set: {
          chairCharacterId: null,
          chairCharacterName: null,
          chairAppointedAt: null,
          chairAppointedBy: null,
          chairTermExpiresAtTurn: null,
          vacancyAwaitingAutomaticSelection: true,
          updatedAt: input.now,
        },
      }
    );
  }
  await db.collection<CentralBank>("centralBanks").updateMany(
    { fomcBoard: { $elemMatch: { occupantType: "player", characterId: input.characterId } } },
    {
      $set: {
        "fomcBoard.$[seat].occupantType": "vacant",
        "fomcBoard.$[seat].characterId": null,
        "fomcBoard.$[seat].characterName": null,
        "fomcBoard.$[seat].nppId": null,
        "fomcBoard.$[seat].appointedByPresidentId": null,
        "fomcBoard.$[seat].termExpiresAtTurn": 0,
      },
    },
    { arrayFilters: [{ "seat.occupantType": "player", "seat.characterId": input.characterId }] }
  );

  // Re-run the normal confirmation path on the next turn: voting is closed, the
  // bank office is gone, so the seat is filled without any special-casing.
  await db.collection<CabinetNomination>("cabinetNominations").updateOne(
    { _id: nomination._id, status: "awaiting_choice" },
    {
      $set: {
        status: "active",
        votingEndsOnTurn: input.currentTurn,
        votingEndsAt: input.now,
        updatedAt: input.now,
      },
      $unset: { choiceOfferedAt: "", choiceExpiresOnTurn: "", rejectedAt: "", rejectionReason: "" },
    }
  );

  if (presidentChar?.userId) {
    notifications.push({
      userId: presidentChar.userId,
      type: "system",
      title: "Cabinet Seat Accepted",
      message: `${nomination.nomineeCharacterName} accepted the appointment to ${posName} and gave up their central bank office. They will be seated on the next turn.`,
      metadata: {
        nominationId: nomination._id.toString(),
        type: "cabinet_confirmed",
        recipientCharacterId: presidentChar._id.toString(),
      },
    });
  }
  if (nomineeChar?.userId && !isSameAsPresident) {
    notifications.push({
      userId: nomineeChar.userId,
      type: "system",
      title: "Cabinet Seat Accepted",
      message: `You accepted the appointment to ${posName} and gave up your central bank office. You will be seated on the next turn.`,
      metadata: {
        nominationId: nomination._id.toString(),
        type: "cabinet_confirmed",
        recipientCharacterId: nomineeChar._id.toString(),
      },
    });
  }
  if (notifications.length > 0) await createNotifications(notifications);
  return { ok: true };
}

/**
 * Reject offers nobody answered. Called from the nomination lifecycle, so it
 * uses one read, one character preload, one bulk write and one notification
 * call: the turn-code architecture review counts every new per-row query.
 */
export async function expireUnansweredCabinetNominationChoices(
  db: Db,
  now: Date,
  currentTurn: number
): Promise<void> {
  const lapsed = await db
    .collection<CabinetNomination>("cabinetNominations")
    .find({ status: "awaiting_choice", choiceExpiresOnTurn: { $lte: currentTurn } })
    .toArray();
  if (lapsed.length === 0) return;

  const nomineeIds = lapsed.flatMap((n) => (n.nomineeCharacterId ? [n.nomineeCharacterId] : []));
  const presidentIds = lapsed.map((n) => n.proposedByPresidentId);
  const characters = await db
    .collection<Character>("characters")
    .find({ _id: { $in: [...nomineeIds, ...presidentIds] } })
    .toArray();
  const characterById = new Map(characters.map((c) => [c._id.toString(), c]));

  const updates: AnyBulkWriteOperation<CabinetNomination>[] = [];
  const notifications: NotificationInput[] = [];

  for (const nomination of lapsed) {
    if (nomination.status !== "awaiting_choice") continue;
    const posName = positionName(nomination.positionId);
    updates.push({
      updateOne: {
        filter: { _id: nomination._id, status: "awaiting_choice" },
        update: {
          $set: {
            status: "rejected",
            rejectedAt: now,
            updatedAt: now,
            rejectionReason: "incompatible_bank_office",
          },
          $unset: { choiceOfferedAt: "", choiceExpiresOnTurn: "" },
        },
      },
    });

    const presidentChar = characterById.get(nomination.proposedByPresidentId.toString());
    const nomineeChar = nomination.nomineeCharacterId
      ? characterById.get(nomination.nomineeCharacterId.toString())
      : undefined;
    const isSameAsPresident =
      !!nomineeChar && nomineeChar._id.toString() === nomination.proposedByPresidentId.toString();

    if (presidentChar?.userId) {
      notifications.push({
        userId: presidentChar.userId,
        type: "system",
        title: "Cabinet Nomination Lapsed",
        message: `${nomination.nomineeCharacterName} did not answer the offer of ${posName}, so the appointment has lapsed and the seat is vacant. You can nominate again.`,
        metadata: {
          nominationId: nomination._id.toString(),
          type: "cabinet_rejected",
          recipientCharacterId: presidentChar._id.toString(),
          rejectionReason: "incompatible_bank_office",
        },
      });
    }
    if (nomineeChar?.userId && !isSameAsPresident) {
      notifications.push({
        userId: nomineeChar.userId,
        type: "system",
        title: "Cabinet Nomination Lapsed",
        message: `You did not answer the offer of ${posName} in time, so the appointment has lapsed.`,
        metadata: {
          nominationId: nomination._id.toString(),
          type: "cabinet_rejected",
          recipientCharacterId: nomineeChar._id.toString(),
          rejectionReason: "incompatible_bank_office",
        },
      });
    }
  }

  if (updates.length > 0) {
    await db.collection<CabinetNomination>("cabinetNominations").bulkWrite(updates);
  }
  if (notifications.length > 0) await createNotifications(notifications);
}
