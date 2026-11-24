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

type ElectoralParty = {
  leadershipElectionMethod?: "party" | "committee" | "influence";
  committeeIds?: ObjectId[];
  chairId?: ObjectId | null;
  viceChairId?: ObjectId | null;
  treasurerId?: ObjectId | null;
};

/**
 * Under the committee method only committee members and national officers
 * vote, judged when ballots are counted, so a ballot cast before a switch to
 * the committee method, or by someone who has since left the committee,
 * counts for nothing. Null when the party uses another method.
 */
export function committeeElectorate(party: ElectoralParty | undefined): ObjectId[] | null {
  if (party?.leadershipElectionMethod !== "committee") return null;
  const ids = new Map<string, ObjectId>();
  for (const id of [
    ...(party.committeeIds ?? []),
    party.chairId,
    party.viceChairId,
    party.treasurerId,
  ]) {
    if (id) ids.set(id.toString(), id);
  }
  return [...ids.values()];
}

/**
 * Mongo clause restricting ballots of committee-method elections to the
 * committee electorate; ballots of other elections pass untouched. Null when
 * no election in the batch uses the committee method.
 */
export function committeeBallotClause(
  elections: readonly { _id: ObjectId; partyId: string; countryId?: string }[],
  partyFor: (partyId: string, countryId: string) => ElectoralParty | undefined
): Document | null {
  const open: ObjectId[] = [];
  const restricted: Document[] = [];
  for (const election of elections) {
    const electorate = committeeElectorate(partyFor(election.partyId, election.countryId ?? "US"));
    if (electorate) restricted.push({ electionId: election._id, voterId: { $in: electorate } });
    else open.push(election._id);
  }
  if (restricted.length === 0) return null;
  return { $or: [...(open.length > 0 ? [{ electionId: { $in: open } }] : []), ...restricted] };
}
