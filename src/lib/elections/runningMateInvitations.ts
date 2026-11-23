/**
 * Running-mate invitations.
 *
 * A presidential nominee no longer writes another player straight onto the
 * slate. Naming a running mate records an invitation (`pendingRunningMateId`)
 * and notifies the invited player, who accepts or declines from the election
 * page. Only an accepted invitation sets `runningMateId`, which is the field
 * presidential resolution reads, so nobody can be made Vice President without
 * agreeing to it.
 */
import type { Db, ObjectId } from "mongodb";
import type { ElectionCandidate } from "@/lib/db/types";
import { createNotifications } from "@/lib/notifications";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { charactersCollection } from "@/lib/db/repositories/characters";

export interface InviteRunningMateInput {
  electionId: ObjectId;
  nomineeCandidateId: ObjectId;
  nomineeName: string;
  invitee: { _id: ObjectId; userId?: ObjectId | null; name: string };
  now?: Date;
  /** Extra filter on the nominee row (e.g. the Russian slate lock). */
  guard?: Record<string, unknown>;
  /** Wording for the invited player's notification. */
  automatic?: boolean;
}

/**
 * Records a pending invitation on the nominee's candidate row and notifies the
 * invited player. Any accepted running mate stays on the slate until the new
 * invitee accepts. Returns false when the guarded write matched no row.
 */
export async function inviteRunningMate(db: Db, input: InviteRunningMateInput): Promise<boolean> {
  const now = input.now ?? new Date();
  const result = await electionCandidatesCollection(db).updateOne(
    { _id: input.nomineeCandidateId, ...(input.guard ?? {}) },
    {
      $set: {
        pendingRunningMateId: input.invitee._id,
        pendingRunningMateInvitedAt: now,
        updatedAt: now,
      },
    }
  );
  if (result.matchedCount !== 1) return false;
  if (input.invitee.userId) {
    await createNotifications([
      {
        userId: input.invitee.userId,
        type: "running_mate_invite",
        title: "Running mate invitation",
        message: input.automatic
          ? `${input.nomineeName}'s primary ended without a running mate, so you have been invited to join the ticket. You will only join if you accept. If the ticket wins, its running mate becomes Vice President.`
          : `${input.nomineeName} has invited you to be their running mate. You will only join the ticket if you accept. If the ticket wins, its running mate becomes Vice President.`,
        metadata: {
          electionId: input.electionId.toString(),
          nomineeCandidateId: input.nomineeCandidateId.toString(),
        },
      },
    ]);
  }
  return true;
}

export type RespondResult =
  | { ok: true; accepted: boolean; nomineeName: string }
  | { ok: false; status: number; error: string };

/**
 * The invited character accepts or declines. Accepting moves the invitation
 * onto `runningMateId`, replacing any earlier running mate on that slate, and
 * withdraws every other open invitation the character holds in this election.
 */
export async function respondToRunningMateInvitation(
  db: Db,
  input: {
    electionId: ObjectId;
    nomineeCandidateId: ObjectId;
    invitee: { _id: ObjectId; name: string };
    accept: boolean;
    now?: Date;
  }
): Promise<RespondResult> {
  const now = input.now ?? new Date();
  const candidates = electionCandidatesCollection(db);
  const nominee = await candidates.findOne({
    _id: input.nomineeCandidateId,
    electionId: input.electionId,
    pendingRunningMateId: input.invitee._id,
  });
  if (!nominee) {
    return { ok: false, status: 404, error: "This invitation is no longer open." };
  }

  if (!input.accept) {
    await candidates.updateOne(
      { _id: nominee._id, pendingRunningMateId: input.invitee._id },
      {
        $unset: { pendingRunningMateId: "", pendingRunningMateInvitedAt: "" },
        $set: { updatedAt: now },
      }
    );
    await notifyNominee(
      db,
      nominee,
      `${input.invitee.name} declined your running mate invitation.`
    );
    return { ok: true, accepted: false, nomineeName: nominee.characterName };
  }

  if (nominee.status !== "active") {
    return { ok: false, status: 409, error: "That ticket is no longer in the race." };
  }

  // One slate per running mate, and no running mate who is also a live candidate.
  const conflict = await candidates.findOne({
    electionId: input.electionId,
    _id: { $ne: nominee._id },
    status: "active",
    $or: [
      { runningMateId: input.invitee._id },
      { characterId: input.invitee._id, campaignSuspended: { $ne: true } },
    ],
  });
  if (conflict) {
    return {
      ok: false,
      status: 409,
      error: "You are already on another ticket in this election.",
    };
  }

  const accepted = await candidates.updateOne(
    { _id: nominee._id, pendingRunningMateId: input.invitee._id, status: "active" },
    {
      $set: { runningMateId: input.invitee._id, updatedAt: now },
      $unset: { pendingRunningMateId: "", pendingRunningMateInvitedAt: "" },
    }
  );
  if (accepted.matchedCount !== 1) {
    return { ok: false, status: 409, error: "This invitation is no longer open." };
  }

  // Close the character's other open invitations in this race.
  await candidates.updateMany(
    { electionId: input.electionId, pendingRunningMateId: input.invitee._id },
    {
      $unset: { pendingRunningMateId: "", pendingRunningMateInvitedAt: "" },
      $set: { updatedAt: now },
    }
  );

  await notifyNominee(db, nominee, `${input.invitee.name} accepted and is now your running mate.`);
  return { ok: true, accepted: true, nomineeName: nominee.characterName };
}

async function notifyNominee(db: Db, nominee: ElectionCandidate, message: string): Promise<void> {
  if (!nominee.characterId) return;
  const char = await charactersCollection(db).findOne(
    { _id: nominee.characterId },
    { projection: { userId: 1 } }
  );
  if (!char?.userId) return;
  await createNotifications([
    {
      userId: char.userId,
      type: "system",
      title: "Running mate answer",
      message,
      metadata: { electionId: nominee.electionId.toString() },
    },
  ]);
}
