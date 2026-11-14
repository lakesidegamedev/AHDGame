import type { Election, ElectionVoteTally, PoliticalParty } from "@/lib/db/types";
import { loadSubdivisionFile } from "@/lib/maps/subdivisionData";
import { getPartyHex } from "@/lib/utils/politics";
import { isCanadianCommons } from "./rules/localGeography";
import { projectCanadianRidings, type CanadianRidingResult } from "./rules/ridingResults";

export type RidingParty = Pick<
  PoliticalParty,
  "_id" | "sequentialId" | "abbreviation" | "color" | "mergedIntoPartyId"
>;

/** Freeze presentation geography while retaining the resolver's actual provincial allocation. */
export async function freezeCanadianRidingResult(input: {
  election: Election;
  tally: ElectionVoteTally;
  votes: Record<string, number>;
  seats: Record<string, number>;
  candidateParties: Record<string, string>;
  parties?: readonly RidingParty[];
}): Promise<CanadianRidingResult | undefined> {
  const { election, tally, parties } = input;
  if (
    election.countryId !== "CA" ||
    !isCanadianCommons(election.electionType) ||
    !parties ||
    (election.electionYear != null && election.electionYear < 2027)
  )
    return;
  const file = await loadSubdivisionFile("subdivisions/ca/federal-ridings", election.state!, {
    preset: "2027-default",
  });
  if (!file) throw new Error("Missing qualified Canadian riding geometry");
  return {
    version: 1,
    countryId: "CA",
    electionId: String(election._id),
    stateId: election.state!,
    planVersion: "2023",
    viewBox: file.viewBox,
    notice: file.notice,
    subdivisions: projectCanadianRidings({
      subdivisions: file.subdivisions,
      votes: input.votes,
      candidateParties: input.candidateParties,
      partyAbbreviations: Object.fromEntries(
        parties.map((p) => [String(p.sequentialId), p.abbreviation])
      ),
      seats: input.seats,
      boosts: election.districtCampaignBoosts,
    }),
    candidateNames: { ...tally.candidateNames },
    candidateParties: { ...input.candidateParties },
    partyColors: Object.fromEntries(
      parties.map((p) => [String(p.sequentialId), getPartyHex(String(p.sequentialId), p.color)])
    ),
    seatsByCandidate: { ...input.seats },
  };
}
