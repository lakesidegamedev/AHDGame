import { ObjectId, type Db } from "mongodb";
import type { Campaign, ElectionCandidate } from "@/lib/db/types";
import {
  pickViewerRaceCampaign,
  type RaceCampaignRow,
} from "@/lib/campaigns/rules/viewerRaceCampaign";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { campaignsCollection } from "@/lib/db/repositories/campaigns";

/**
 * The viewer's own campaign in one race: as candidate, appointed manager or
 * running mate, across every character the account owns. Null when there is
 * none. Read-only, and it names only a campaign the viewer already has owner
 * access to.
 */
export async function findViewerRaceCampaignId(
  db: Db,
  electionId: ObjectId,
  userId: string
): Promise<string | null> {
  if (!ObjectId.isValid(userId)) return null;
  const userOid = new ObjectId(userId);

  const owned = await charactersCollection(db)
    .find({ userId: userOid }, { projection: { _id: 1 } })
    .toArray();
  const ownedIds = owned.map((c) => c._id);

  const mateRows =
    ownedIds.length > 0
      ? await electionCandidatesCollection(db)
          .find(
            { electionId, status: "active", runningMateId: { $in: ownedIds } },
            { projection: { characterId: 1 } }
          )
          .toArray()
      : [];
  const mateTicketIds = mateRows.map((r) => r.characterId);

  const campaigns = await campaignsCollection(db)
    .find(
      {
        electionId,
        $or: [
          { managerId: userOid },
          { "managers.userId": userOid },
          { candidateId: { $in: [...ownedIds, ...mateTicketIds] } },
        ],
      },
      { projection: { candidateId: 1, status: 1, managerId: 1, managers: 1 } }
    )
    .toArray();

  const rows: RaceCampaignRow[] = campaigns.map((c) => ({
    id: c._id.toString(),
    candidateId: c.candidateId.toString(),
    archived: c.status === "archived",
    managerUserIds: [c.managerId, ...(c.managers ?? []).map((m) => m.userId)]
      .filter((id): id is ObjectId => id != null)
      .map((id) => id.toString()),
  }));

  return pickViewerRaceCampaign({
    campaigns: rows,
    userId,
    ownedCharacterIds: new Set(ownedIds.map((id) => id.toString())),
    ticketsAsRunningMate: new Set(mateTicketIds.map((id) => id.toString())),
  });
}
