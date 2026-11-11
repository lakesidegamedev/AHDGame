/** standingAdRegions keeps targeted ads at home unless the owner has a live presidential candidacy. */
import type { Db } from "mongodb";
import type { Character, Election, ElectionCandidate, State } from "@/lib/db/types";
import { forbidden } from "@/lib/api/errors";
import { statesCollection } from "@/lib/db/repositories/states";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";

async function standingAdRegions(db: Db, owner: Character) {
  const candidates = await electionCandidatesCollection(db)
    .find(
      { characterId: owner._id, status: "active", campaignSuspended: { $ne: true } },
      { projection: { electionId: 1 } }
    )
    .toArray();
  const presidential =
    candidates.length > 0 &&
    (await electionsCollection(db).findOne(
      {
        _id: { $in: candidates.map((candidate) => candidate.electionId) },
        countryId: owner.countryId,
        electionType: { $in: ["president", "uachtaran", "special_president"] },
        status: "active",
      },
      { projection: { _id: 1 } }
    ));
  return statesCollection(db)
    .find(
      {
        countryId: owner.countryId,
        _id: presidential ? { $ne: owner.countryId } : owner.homeState,
      },
      { projection: { _id: 1, name: 1 } }
    )
    .toArray();
}

export async function assertStandingAdRegion(db: Db, owner: Character, stateId: string) {
  const regions = await standingAdRegions(db, owner);
  if (!regions.some((region) => region._id === stateId))
    throw forbidden("Target your home state. Other states require an active presidential race.");
  return regions;
}
