import type { Db, Document, ObjectId } from "mongodb";
import { charactersCollection } from "@/lib/db/repositories/characters";

/** Revalidate membership at resolution so interrupted departure cleanup cannot preserve ballots or candidacies. */
export async function leadershipEligibilityFilters(
  db: Db,
  elections: readonly { _id: ObjectId; partyId: string; countryId?: string }[]
): Promise<{ voterFilter: Document; candidateFilter: Document }> {
  const partyIds = [...new Set(elections.map((e) => e.partyId))];
  const members = await charactersCollection(db)
    .find(
      { party: { $in: partyIds }, retiredAt: { $exists: false } },
      { projection: { _id: 1, party: 1, countryId: 1 } }
    )
    .toArray();
  const groups = new Map<string, { electionIds: ObjectId[]; voters: ObjectId[] }>();
  for (const election of elections) {
    const country = election.countryId ?? "US";
    const key = `${country}:${election.partyId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        electionIds: [],
        voters: members
          .filter((m) => m.party === election.partyId && (m.countryId ?? "US") === country)
          .map((m) => m._id),
      };
      groups.set(key, group);
    }
    group.electionIds.push(election._id);
  }
  const filterFor = (field: "voterId" | "characterId"): Document => ({
    $or: [...groups.values()].map((group) => ({
      electionId: { $in: group.electionIds },
      [field]: { $in: group.voters },
    })),
  });
  return { voterFilter: filterFor("voterId"), candidateFilter: filterFor("characterId") };
}

export async function leadershipVoterFilter(
  db: Db,
  elections: readonly { _id: ObjectId; partyId: string; countryId?: string }[]
): Promise<Document> {
  return (await leadershipEligibilityFilters(db, elections)).voterFilter;
}
