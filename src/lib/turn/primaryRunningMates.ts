/**
 * Tentative running mates for presidential nominees, assigned when primaries
 * resolve (autoAssignTentativeRunningMates). Split from primaryResolution.ts.
 */
import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import type { getDb } from "@/lib/mongodb";
import type { ElectionCandidate, Character } from "@/lib/db/types";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import { getExecutiveOfficialFilter } from "@/lib/elections/executiveOfficeFilters";
import { hasReachedExecutiveTermLimit } from "@/lib/elections/executiveTermLimits";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import type { Document } from "mongodb";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";

/**
 * For each player presidential nominee without a running mate or an open
 * invitation, invite the highest-favorability same-party character in the
 * same country who is not themselves a candidate or the incumbent president.
 * The invitee joins the ticket only by accepting (ticket 1889); the nominee is
 * told who was invited and can name someone else via the running-mate UI.
 */
export async function autoAssignTentativeRunningMates(
  db: Awaited<ReturnType<typeof getDb>>,
  nominees: ElectionCandidate[],
  countryId: CountryId
): Promise<void> {
  const needsVp = nominees.filter(
    (c) => !c.isNPP && !c.runningMateId && !c.pendingRunningMateId && c.characterId != null
  );
  if (needsVp.length === 0) return;

  // Incumbent president is disqualified from being a running mate
  const incumbent = await electedOfficialsCollection<Document>(db).findOne(
    getExecutiveOfficialFilter(countryId, "president"),
    {
      projection: { characterId: 1 },
    }
  );
  const incumbentId: ObjectId | null = (incumbent?.characterId as ObjectId | null) ?? null;
  const countryConfig = getCountryConfig(countryId);

  const candidateIdSet = new Set(nominees.map((c) => c.characterId?.toString()).filter(Boolean));

  // Group nominees by party so we run one query per party instead of one per nominee
  const nomineesByParty = new Map<string, typeof needsVp>();
  for (const n of needsVp) {
    const list = nomineesByParty.get(n.party) ?? [];
    list.push(n);
    nomineesByParty.set(n.party, list);
  }

  const partyQueries = [...nomineesByParty.keys()].map((party) =>
    charactersCollection(db)
      .find({
        countryId,
        party,
        userId: { $ne: null },
        _id: { $nin: needsVp.map((n) => n.characterId) },
      })
      .sort({ favorability: -1 })
      .limit(10)
      .toArray()
  );
  const partyCandidatesArrays = await Promise.all(partyQueries);
  const candidatesByParty = new Map<string, Character[]>();
  let idx = 0;
  for (const party of nomineesByParty.keys()) {
    candidatesByParty.set(party, partyCandidatesArrays[idx++]);
  }

  // Batch-fetch nominee characters for notifications in one query
  const nomineeChars = await charactersCollection(db)
    .find(
      { _id: { $in: needsVp.map((n) => n.characterId) } },
      { projection: { _id: 1, userId: 1 } }
    )
    .toArray();
  const nomineeCharMap = new Map(nomineeChars.map((c) => [c._id.toString(), c]));
  const runningMateWrites: AnyBulkWriteOperation<ElectionCandidate>[] = [];
  const notificationAssignments: Array<{
    nomineeId: ObjectId;
    runningMateId: ObjectId;
    notifications: NotificationInput[];
  }> = [];
  const assignedAt = new Date();

  for (const nominee of needsVp) {
    const candidates = candidatesByParty.get(nominee.party) ?? [];

    const pick = candidates.find(
      (c) =>
        !candidateIdSet.has(c._id.toString()) &&
        (!incumbentId || !c._id.equals(incumbentId)) &&
        !(
          countryConfig.executiveTermLimit?.blocksRunningMateSelection &&
          hasReachedExecutiveTermLimit(c, countryId)
        )
    );

    if (!pick) continue;
    runningMateWrites.push({
      updateOne: {
        // Do not overwrite a player selection or invitation made after `needsVp` was read.
        filter: {
          _id: nominee._id,
          $and: [
            { $or: [{ runningMateId: { $exists: false } }, { runningMateId: { $type: 10 } }] },
            {
              $or: [
                { pendingRunningMateId: { $exists: false } },
                { pendingRunningMateId: { $type: 10 } },
              ],
            },
          ],
        },
        update: {
          $set: {
            pendingRunningMateId: pick._id,
            pendingRunningMateInvitedAt: assignedAt,
            updatedAt: assignedAt,
          },
        },
      },
    });

    const notifications: NotificationInput[] = [];
    const nomineeChar = nomineeCharMap.get(nominee.characterId.toString());
    if (nomineeChar?.userId) {
      notifications.push({
        userId: nomineeChar.userId,
        type: "general_win",
        title: "Running mate invitation sent",
        message: `Since you didn't pick a running mate before the primary ended, ${pick.name} has been invited to join your ticket. They join only if they accept. You can invite someone else from the election page.`,
        metadata: {
          electionId: nominee.electionId.toString(),
          tentativeVpId: pick._id.toString(),
        },
      });
    }
    if (pick.userId) {
      notifications.push({
        userId: pick.userId,
        type: "running_mate_invite",
        title: "Running mate invitation",
        message: `${nominee.characterName}'s primary ended without a running mate, so you have been invited to join the ticket. You will only join if you accept. If the ticket wins, its running mate becomes Vice President.`,
        metadata: {
          electionId: nominee.electionId.toString(),
          nomineeCandidateId: nominee._id.toString(),
        },
      });
    }
    notificationAssignments.push({
      nomineeId: nominee._id,
      runningMateId: pick._id,
      notifications,
    });
  }
  if (runningMateWrites.length > 0) {
    const result = await electionCandidatesCollection(db).bulkWrite(runningMateWrites, {
      ordered: false,
    });
    let confirmedNotifications = notificationAssignments;
    if (result.matchedCount !== runningMateWrites.length && notificationAssignments.length > 0) {
      const confirmed = await electionCandidatesCollection(db)
        .find(
          {
            _id: { $in: notificationAssignments.map(({ nomineeId }) => nomineeId) },
            updatedAt: assignedAt,
          },
          { projection: { _id: 1, pendingRunningMateId: 1 } }
        )
        .toArray();
      const confirmedRunningMateByNominee = new Map(
        confirmed.map((candidate) => [
          candidate._id.toString(),
          candidate.pendingRunningMateId?.toString(),
        ])
      );
      confirmedNotifications = notificationAssignments.filter(
        ({ nomineeId, runningMateId }) =>
          confirmedRunningMateByNominee.get(nomineeId.toString()) === runningMateId.toString()
      );
    }
    if (confirmedNotifications.length > 0) {
      await createNotifications(
        confirmedNotifications.flatMap(({ notifications }) => notifications)
      );
    }
  }
}
