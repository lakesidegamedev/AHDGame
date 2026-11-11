import { ObjectId, type Db } from "mongodb";
import type { Campaign, Election } from "@/lib/db/types";
import { computeElectionPhase } from "@/lib/elections/phases";
import { getGameTime } from "@/lib/time/gameTime";
import {
  campaignRedirectTarget,
  type CampaignRedirectQuery,
} from "@/lib/campaignManager/campaignRedirect";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { campaignsCollection } from "@/lib/db/repositories/campaigns";

/**
 * Where `/campaign/[id]` redirects to, or null when the old page should render
 * (an unknown campaign included, so its not-found state still shows).
 */
export async function resolveCampaignRedirect(
  db: Db,
  campaignId: string,
  query: CampaignRedirectQuery
): Promise<string | null> {
  if (!ObjectId.isValid(campaignId)) return null;
  const campaign = await campaignsCollection(db)
    .findOne({ _id: new ObjectId(campaignId) }, { projection: { electionId: 1 } });
  if (!campaign) return null;

  const election = await electionsCollection(db).findOne(
    { _id: campaign.electionId },
    {
      projection: {
        countryId: 1,
        electionType: 1,
        status: 1,
        startTime: 1,
        primaryEndTime: 1,
        endTime: 1,
        startTurn: 1,
        primaryEndTurn: 1,
        endTurn: 1,
      },
    }
  );
  if (!election) return null;

  const phase = computeElectionPhase(
    election.startTime ?? null,
    election.primaryEndTime ?? null,
    election.endTime ?? null,
    election.status,
    await getGameTime(),
    {
      startTurn: election.startTurn,
      primaryEndTurn: election.primaryEndTurn,
      endTurn: election.endTurn,
    }
  );

  return campaignRedirectTarget(
    campaignId,
    {
      id: election._id.toHexString(),
      countryId: election.countryId,
      electionType: election.electionType,
      isUpcoming: phase.isUpcoming,
    },
    query
  );
}
