import type { Db, ObjectId } from "mongodb";
import type {
  Election,
  ElectionCandidate,
  StatePartyCandidate,
  StatePartyElection,
} from "@/lib/db/types";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { statePartyCandidatesCollection } from "@/lib/db/repositories/statePartyCandidates";
import { statePartyElectionsCollection } from "@/lib/db/repositories/statePartyElections";

/**
 * Summarize the candidacies that a relocation will auto-withdraw.
 * Returned to the client so the confirmation dialog can warn the user.
 */
export async function getActiveCandidacySummary(
  db: Db,
  characterId: ObjectId
): Promise<{
  generalElections: number;
  statePartyElections: number;
}> {
  const generalRows = await electionCandidatesCollection(db)
    .find({ characterId, status: "active" })
    .project({ electionId: 1 })
    .toArray();

  let generalElections = 0;
  if (generalRows.length > 0) {
    const electionIds = [...new Set(generalRows.map((r) => r.electionId))];
    const openCount = await electionsCollection(db).countDocuments({
      _id: { $in: electionIds },
      status: { $in: ["upcoming", "active", "completed"] },
    });
    generalElections = openCount;
  }

  const spRows = await statePartyCandidatesCollection(db)
    .find({ characterId, status: "active" })
    .project({ electionId: 1 })
    .toArray();

  let statePartyElections = 0;
  if (spRows.length > 0) {
    const electionIds = [...new Set(spRows.map((r) => r.electionId))];
    const openCount = await statePartyElectionsCollection(db).countDocuments({
      _id: { $in: electionIds },
      status: "voting",
    });
    statePartyElections = openCount;
  }

  return { generalElections, statePartyElections };
}
