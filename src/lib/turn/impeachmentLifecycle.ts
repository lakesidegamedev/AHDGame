import type { AnyBulkWriteOperation } from "mongodb";
import { withSessionDb, afterCommit } from "@/lib/db/sessionDb";
import type { Db } from "@/lib/mongodb";
import type { Impeachment, ImpeachmentStage } from "@/lib/db/types/impeachment";
import {
  getLowerChamberOfficeType,
  getUpperChamberOfficeType,
} from "@/lib/legislature/chamberOfficeType";
import { getSubNationalLegislatureKey } from "@/lib/constants/countries";
import { getExecutiveOfficialFilter } from "@/lib/elections/executiveOfficeFilters";
import { governorOfficialFilter } from "@/lib/db/electedOfficialScope";
import {
  tallyImpeachmentChamber,
  passesHouseImpeachment,
  passesSenateConviction,
} from "@/lib/impeachment/impeachmentTally";
import {
  removeImpeachedExecutive,
  removeImpeachedGovernor,
} from "@/lib/impeachment/removeImpeachedExecutive";
import { IMPEACHMENT_SENATE_VOTING_TURNS } from "@/lib/constants/impeachment";
import { createNotification } from "@/lib/notifications";
import { autoVoteNppsForImpeachmentStage } from "@/lib/impeachment/autoVoteNpps";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { impeachmentsCollection } from "@/lib/db/repositories/impeachments";

/**
 * Advance every open impeachment whose current-stage voting window has closed.
 * House stage → simple majority impeaches (advance to Senate), else dismissed.
 * Senate stage → seat-weighted 2/3 convicts (vacate the executive; the later
 * `presidentialSuccession` phase then promotes the VP), else acquitted.
 * Auto-cancels a case whose target is no longer the sitting president.
 *
 * Must be sequenced BEFORE `presidentialSuccession` so a conviction-induced
 * vacancy is filled the same turn.
 */
export async function processImpeachmentLifecycle(
  db: Db,
  currentTurn: number,
  now: Date
): Promise<{ resolved: number }> {
  return withSessionDb(db, (tx) => processImpeachmentLifecycleInTransaction(tx, currentTurn, now));
}

async function processImpeachmentLifecycleInTransaction(
  db: Db,
  currentTurn: number,
  now: Date
): Promise<{ resolved: number }> {
  const open = await impeachmentsCollection(db)
    .find({ stage: { $in: ["house", "senate"] } })
    .toArray();

  if (open.length === 0) return { resolved: 0 };
  const [holders, recipients] = await Promise.all([
    electedOfficialsCollection(db)
      .find(
        {
          $or: open.map((imp) =>
            imp.targetOffice === "governor" && imp.state
              ? governorOfficialFilter(imp.countryId, imp.state)
              : getExecutiveOfficialFilter(imp.countryId, "president")
          ),
        },
        { projection: { countryId: 1, officeType: 1, state: 1, characterId: 1 } }
      )
      .toArray(),
    charactersCollection(db)
      .find(
        { _id: { $in: open.map((imp) => imp.targetCharacterId) } },
        { projection: { userId: 1, name: 1 } }
      )
      .toArray(),
  ]);
  const recipientById = new Map(recipients.map((c) => [c._id.toString(), c]));
  const stageAdvances: AnyBulkWriteOperation<Impeachment>[] = [];
  let resolved = 0;

  const claim = async (imp: Impeachment, stage: ImpeachmentStage): Promise<boolean> => {
    const res = await impeachmentsCollection(db).updateOne(
      { _id: imp._id, stage: imp.stage },
      { $set: { stage, resolvedOnTurn: currentTurn, updatedAt: now } }
    );
    return res.modifiedCount > 0;
  };

  for (const imp of open) {
    const isGovernor = imp.targetOffice === "governor";

    // Auto-cancel if the target is no longer the sitting office-holder (resigned,
    // lost office, already succeeded/removed).
    const holder = holders.find(
      (h) =>
        (h.countryId ?? "US") === imp.countryId &&
        h.officeType === (isGovernor ? "governor" : "president") &&
        (!isGovernor || h.state === imp.state)
    );
    const stillHolds =
      holder?.characterId != null &&
      holder.characterId.toString() === imp.targetCharacterId.toString();
    if (!stillHolds) {
      if (await claim(imp, "cancelled")) resolved++;
      continue;
    }

    const stageVotes = await autoVoteNppsForImpeachmentStage(db, imp);

    // Governor: single-chamber state-legislature conviction vote (filed at
    // stage "senate"). 2/3 removes; the merged byElectionWatcher then spawns a
    // governor by-election to refill the seat.
    if (isGovernor) {
      if (imp.senateVotingEndsOnTurn == null || currentTurn < imp.senateVotingEndsOnTurn) continue;
      const stateChamber = getSubNationalLegislatureKey(imp.countryId);
      const tally = await tallyImpeachmentChamber(
        db,
        imp.countryId,
        stateChamber,
        stageVotes,
        imp.state
      );
      if (passesSenateConviction(tally)) {
        if (await claim(imp, "convicted")) {
          await removeImpeachedGovernor(db, imp.countryId, imp.state!, imp.targetCharacterId, now);
          const targetChar = recipientById.get(imp.targetCharacterId.toString());
          if (targetChar?.userId) {
            await afterCommit(db, () =>
              createNotification({
                userId: targetChar.userId,
                type: "impeachment_convicted",
                title: "Removed from Office",
                message: `${imp.targetName} has been convicted by the ${imp.state} state legislature and removed as Governor.`,
                metadata: {
                  impeachmentId: imp._id.toString(),
                  countryId: imp.countryId,
                  state: imp.state,
                },
              })
            );
          }
          resolved++;
        }
      } else if (await claim(imp, "acquitted")) {
        resolved++;
      }
      continue;
    }

    if (imp.stage === "house") {
      if (currentTurn < imp.houseVotingEndsOnTurn) continue; // window still open
      const tally = await tallyImpeachmentChamber(
        db,
        imp.countryId,
        getLowerChamberOfficeType(imp.countryId),
        stageVotes
      );
      if (passesHouseImpeachment(tally)) {
        stageAdvances.push({
          updateOne: {
            filter: { _id: imp._id, stage: "house" },
            update: {
              $set: {
                stage: "senate",
                senateVotingEndsOnTurn: currentTurn + IMPEACHMENT_SENATE_VOTING_TURNS,
                updatedAt: now,
              },
              // whippedFromVote is a single map shared by both stages, so a
              // House-stage snapshot would otherwise follow the case into the
              // Senate stage and show those members a "Whipped by Party" badge
              // for a vote they can no longer cast.
              $unset: { whippedFromVote: "" },
            },
          },
        });
        resolved++;
      } else if (await claim(imp, "dismissed")) {
        resolved++;
      }
      continue;
    }

    // Senate stage
    if (imp.senateVotingEndsOnTurn == null || currentTurn < imp.senateVotingEndsOnTurn) continue;
    const upperOffice = getUpperChamberOfficeType(imp.countryId);
    const tally = upperOffice
      ? await tallyImpeachmentChamber(db, imp.countryId, upperOffice, stageVotes)
      : { for: 0, against: 0, seats: 0 };

    if (upperOffice && passesSenateConviction(tally)) {
      if (await claim(imp, "convicted")) {
        await removeImpeachedExecutive(db, imp.countryId, "president", imp.targetCharacterId, now);
        const targetChar = recipientById.get(imp.targetCharacterId.toString());
        if (targetChar?.userId) {
          await afterCommit(db, () =>
            createNotification({
              userId: targetChar.userId,
              type: "impeachment_convicted",
              title: "Removed from Office",
              message: `${imp.targetName} has been convicted by the ${imp.countryId} Senate and removed from the presidency.`,
              metadata: { impeachmentId: imp._id.toString(), countryId: imp.countryId },
            })
          );
        }
        resolved++;
      }
    } else if (await claim(imp, "acquitted")) {
      resolved++;
    }
  }

  if (stageAdvances.length > 0) {
    const advanced = await impeachmentsCollection(db).bulkWrite(stageAdvances);
    if (advanced.matchedCount !== stageAdvances.length)
      throw new Error("Impeachment stage changed during resolution");
  }
  return { resolved };
}
