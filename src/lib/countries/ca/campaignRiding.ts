import type { Db, ObjectId } from "mongodb";
import { withSessionDb } from "@/lib/db/sessionDb";
import { getGameStateCore } from "@/lib/gameState";
import { resolveElectionRouteParam } from "@/lib/elections/electionParamResolution";
import { loadSubdivisionFile } from "@/lib/maps/subdivisionData";
import { spendPoliticalStrength } from "@/lib/parties/commands/spendPoliticalStrength";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import {
  applyCampaignBoost,
  CAMPAIGN_BASE_PS_COST,
  CAMPAIGN_BOOST_PER_ACTION,
  CAMPAIGN_SELF_EFFICIENCY,
  CAMPAIGN_ALLY_EFFICIENCY,
} from "@/lib/redistricting/campaignBoost";
import { isCanadianCommons, hasCanadianLocalGeography } from "./rules/localGeography";

export class CanadianRidingCampaignError extends Error {}

export async function campaignCanadianRiding(
  db: Db,
  input: {
    stateId: string;
    partyId: string;
    characterId: ObjectId;
    electionId: string;
    districtIndex: number;
    ridingId: string;
    planVersion: string;
    now: Date;
  }
) {
  if (!hasCanadianLocalGeography(input.stateId))
    throw new CanadianRidingCampaignError("Unknown Canadian province or territory");
  const file = await loadSubdivisionFile("subdivisions/ca/federal-ridings", input.stateId, {
    preset: "2027-default",
  });
  if (
    input.planVersion !== "2023" ||
    !file?.subdivisions.some(
      (r) => r.id === input.ridingId && r.id === `CA-FED-2023-${input.districtIndex}`
    )
  )
    throw new CanadianRidingCampaignError(
      "Riding or boundary version does not match this province"
    );
  return withSessionDb(db, async (tx) => {
    const resolved = await resolveElectionRouteParam(tx, input.electionId);
    const election = resolved.ok ? resolved.election : null;
    if (
      !election ||
      election.countryId !== "CA" ||
      election.state !== input.stateId ||
      !isCanadianCommons(election.electionType) ||
      !["active", "upcoming"].includes(election.status) ||
      election.resolving
    )
      throw new CanadianRidingCampaignError("No open Canadian Commons race here");
    const gs = await getGameStateCore(tx);
    if (gs?.preset !== "2027-default")
      throw new CanadianRidingCampaignError(
        "Canadian riding campaigns require a world using the 2027 preset"
      );
    const candidate = await electionCandidatesCollection(tx).findOne({
      electionId: election._id,
      characterId: input.characterId,
      party: input.partyId,
      status: "active",
    });
    const efficiency = candidate ? CAMPAIGN_SELF_EFFICIENCY : CAMPAIGN_ALLY_EFFICIENCY;
    const spend = await spendPoliticalStrength(
      {
        countryId: "CA",
        partyId: input.partyId,
        scope: "state",
        stateId: input.stateId,
        baseCost: CAMPAIGN_BASE_PS_COST,
        action: "campaign-here",
        now: input.now,
        turn: gs.currentTurn,
      },
      tx
    );
    if (!spend.ok)
      throw new CanadianRidingCampaignError(
        spend.reason === "insufficient-ps" ? "Insufficient political strength" : spend.reason
      );
    const key = `districtCampaignBoosts.${input.districtIndex}.${input.partyId}`;
    const current =
      election.districtCampaignBoosts?.[String(input.districtIndex)]?.[input.partyId] ?? 0;
    const boost = applyCampaignBoost(current, CAMPAIGN_BOOST_PER_ACTION * efficiency);
    const changed = await electionsCollection(tx).updateOne(
      {
        _id: election._id,
        countryId: "CA",
        state: input.stateId,
        status: { $in: ["active", "upcoming"] },
        resolving: { $ne: true },
      },
      { $set: { [key]: boost, updatedAt: input.now } }
    );
    if (changed.matchedCount !== 1) throw new CanadianRidingCampaignError("Race is no longer open");
    return { ok: true, boost, psCost: spend.effectiveCost, efficiency };
  });
}
