import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import type { NotificationType, PoliticalParty } from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { getPartyRoleLabel } from "./partyRoleLabels";
import {
  actingChairNotice,
  removalVoteOpenedNotice,
  removedByCommitteeNotice,
  type RemovableOfficeRole,
} from "./rules/officeRemovalNotice";

type PartyLabels = Pick<PoliticalParty, "name" | "countryId" | "leadershipTitles">;

function roleLabelFor(party: PartyLabels, role: RemovableOfficeRole): string {
  if (role === "campaigner") return "Campaigner";
  if (role === "committeeMember") return getPartyRoleLabel(party.countryId, "committee");
  return getPartyRoleLabel(party.countryId, role, party.leadershipTitles);
}

async function userIdsByCharacter(characterIds: ObjectId[]): Promise<Map<string, ObjectId>> {
  const db = await getDb();
  const rows = await charactersCollection(db)
    .find({ _id: { $in: characterIds } })
    .project<{ _id: ObjectId; userId?: ObjectId }>({ _id: 1, userId: 1 })
    .toArray();
  const out = new Map<string, ObjectId>();
  for (const row of rows) if (row.userId) out.set(row._id.toString(), row.userId);
  return out;
}

export interface RemovalVoteOpened {
  party: PartyLabels & { _id: ObjectId };
  proposalId: ObjectId;
  role: RemovableOfficeRole;
  targetCharacterId: ObjectId;
  yesNeeded: number;
  eligibleVoters: number;
  expiresAtTurn: number;
}

/** Tells the office holder a committee vote to remove them has opened. */
export async function notifyRemovalVoteOpened(input: RemovalVoteOpened): Promise<void> {
  const { party, proposalId, role, targetCharacterId } = input;
  const userId = (await userIdsByCharacter([targetCharacterId])).get(targetCharacterId.toString());
  if (!userId) return;
  const notice = removalVoteOpenedNotice({
    partyName: party.name,
    roleLabel: roleLabelFor(party, role),
    committeeLabel: getPartyRoleLabel(party.countryId, "committee"),
    yesNeeded: input.yesNeeded,
    eligibleVoters: input.eligibleVoters,
    expiresAtTurn: input.expiresAtTurn,
  });
  await createNotifications([
    {
      userId,
      type: "office_removal_vote_opened",
      ...notice,
      metadata: {
        partyId: party._id.toString(),
        countryId: party.countryId,
        proposalId: proposalId.toString(),
        position: role,
        recipientCharacterId: targetCharacterId.toString(),
      },
    },
  ]);
}

export interface RemovedByCommittee {
  partyId: ObjectId;
  proposalId: ObjectId;
  role: RemovableOfficeRole;
  targetCharacterId: ObjectId;
}

/**
 * Tells the removed holder why their seat is gone and, for a chair removal,
 * tells the seated vice chair that they now hold the chair's powers.
 */
export async function notifyRemovedByCommittee(input: RemovedByCommittee): Promise<void> {
  const { partyId, proposalId, role, targetCharacterId } = input;
  const db = await getDb();
  const party = await politicalPartiesCollection(db).findOne(
    { _id: partyId },
    { projection: { _id: 1, name: 1, countryId: 1, leadershipTitles: 1, viceChairId: 1 } }
  );
  if (!party) return;

  const viceChairId = role === "chair" ? (party.viceChairId ?? null) : null;
  const recipients = viceChairId ? [targetCharacterId, viceChairId] : [targetCharacterId];
  const userIds = await userIdsByCharacter(recipients);
  const committeeLabel = getPartyRoleLabel(party.countryId, "committee");
  const metadata = {
    partyId: party._id.toString(),
    countryId: party.countryId,
    proposalId: proposalId.toString(),
    position: role,
    reason: "committee_vote",
  };

  const inputs: NotificationInput[] = [];
  const targetUserId = userIds.get(targetCharacterId.toString());
  if (targetUserId) {
    const type: NotificationType =
      role === "committeeMember" ? "committee_removed" : "national_leadership_removed";
    inputs.push({
      userId: targetUserId,
      type,
      ...removedByCommitteeNotice({
        partyName: party.name,
        role,
        roleLabel: roleLabelFor(party, role),
        committeeLabel,
      }),
      metadata: { ...metadata, recipientCharacterId: targetCharacterId.toString() },
    });
  }
  const viceUserId = viceChairId ? userIds.get(viceChairId.toString()) : undefined;
  if (viceChairId && viceUserId) {
    inputs.push({
      userId: viceUserId,
      type: "national_leadership_appointed",
      ...actingChairNotice({
        partyName: party.name,
        chairLabel: roleLabelFor(party, "chair"),
        viceChairLabel: roleLabelFor(party, "viceChair"),
        committeeLabel,
      }),
      metadata: { ...metadata, recipientCharacterId: viceChairId.toString() },
    });
  }
  await createNotifications(inputs);
}
