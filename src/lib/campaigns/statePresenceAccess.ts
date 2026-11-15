import { ObjectId, type Db } from "mongodb";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { isCampaignManagerUser, isCampaignNomineeUser } from "@/lib/campaigns/access";
import type { Campaign, Character, ElectionCandidate } from "@/lib/db/types";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { campaignsCollection } from "@/lib/db/repositories/campaigns";

export type PresenceCampaign = Pick<
  Campaign,
  | "_id"
  | "electionId"
  | "candidateId"
  | "candidateIsNPP"
  | "managerId"
  | "managers"
  | "status"
  | "actions"
  | "funds"
>;

/** The candidate fields Campaign Presence needs: currency, party colour, home state. */
export type PresenceCandidate = Pick<Character, "_id" | "countryId" | "party" | "homeState">;

export interface PresenceSubject {
  campaign: PresenceCampaign;
  candidate: PresenceCandidate;
}

/**
 * Who a Campaign Presence request acts for when it names a campaign.
 *
 * Presence is the candidate's: the rows live under the candidate's character
 * and are paid out of the campaign's own pools. The candidate's own account
 * and an appointed manager may act on it; the running mate and everyone else
 * may not. An archived or suspended campaign cannot be managed at all, the
 * same as every other campaign management action.
 *
 * Throws API errors, so a route lets `handleRouteError` answer them.
 */
export async function resolvePresenceSubject(
  db: Db,
  params: {
    campaignId: string;
    userId: string;
    activeCharacterId?: ObjectId | string | null;
  }
): Promise<PresenceSubject> {
  const { campaignId, userId, activeCharacterId } = params;
  if (!ObjectId.isValid(campaignId)) throw badRequest("Invalid campaign id");

  const campaign = await campaignsCollection(db).findOne(
    { _id: new ObjectId(campaignId) },
    {
      projection: {
        electionId: 1,
        candidateId: 1,
        candidateIsNPP: 1,
        managerId: 1,
        managers: 1,
        status: 1,
        actions: 1,
        funds: 1,
      },
    }
  );
  if (!campaign) throw notFound("Campaign not found");

  // Authorize before saying anything about the campaign's state, so a stranger
  // learns nothing beyond "not yours".
  const allowed =
    isCampaignManagerUser(campaign, userId) ||
    (await isCampaignNomineeUser(db, campaign, userId, activeCharacterId));
  if (!allowed) {
    throw forbidden("Only the candidate or a campaign manager can build Campaign Presence.");
  }

  if (campaign.status === "archived") {
    throw badRequest("This campaign has been eliminated and can no longer be managed.");
  }
  if (campaign.candidateIsNPP) {
    throw badRequest("Campaign Presence is not available for this ticket.");
  }

  const candidateRow = await electionCandidatesCollection(db).findOne(
    { electionId: campaign.electionId, characterId: campaign.candidateId, status: "active" },
    { projection: { campaignSuspended: 1 } }
  );
  if (candidateRow?.campaignSuspended) {
    throw badRequest("This campaign is suspended. Management actions are disabled.");
  }

  const candidate = await charactersCollection(db).findOne(
    { _id: campaign.candidateId },
    { projection: { countryId: 1, party: 1, homeState: 1 } }
  );
  if (!candidate) throw notFound("Candidate not found");
  if (!countryHasFeature("usLib", candidate.countryId)) {
    throw forbidden("Campaign Presence is currently a US-only feature");
  }

  return { campaign, candidate };
}
