import type { Db, ObjectId } from "mongodb";
import type { Election, ElectionCandidate } from "@/lib/db/types";

/**
 * Shared preload for the two endorsement-withdrawal turn phases.
 *
 * Both phases read only `status` per row, so this projects to it and returns
 * status maps rather than documents. A missing key and a non-active status
 * collapse to the same decision at the call site.
 */
export interface EndorsementTargetStatuses {
  /** electionId → status. Absent key means the election row does not exist. */
  electionStatus: Map<string, Election["status"]>;
  /** candidateId → status. Absent key means the candidate row does not exist. */
  candidateStatus: Map<string, ElectionCandidate["status"]>;
}

interface EndorsementTargetRefs {
  electionId: ObjectId;
  candidateId: ObjectId;
}

export async function preloadEndorsementTargets(
  db: Db,
  endorsements: ReadonlyArray<EndorsementTargetRefs>
): Promise<EndorsementTargetStatuses> {
  const electionStatus = new Map<string, Election["status"]>();
  const candidateStatus = new Map<string, ElectionCandidate["status"]>();
  if (endorsements.length === 0) return { electionStatus, candidateStatus };

  // Dedupe first: one leader endorsing twenty candidates in the same race is
  // the common shape, so the id sets are typically far smaller than the input.
  const electionIds = dedupe(endorsements.map((e) => e.electionId));
  const candidateIds = dedupe(endorsements.map((e) => e.candidateId));

  const [elections, candidates] = await Promise.all([
    db
      .collection<Election>("elections")
      .find({ _id: { $in: electionIds } }, { projection: { status: 1 } })
      .toArray(),
    db
      .collection<ElectionCandidate>("electionCandidates")
      .find({ _id: { $in: candidateIds } }, { projection: { status: 1 } })
      .toArray(),
  ]);

  for (const row of elections) electionStatus.set(row._id.toString(), row.status);
  for (const row of candidates) candidateStatus.set(row._id.toString(), row.status);
  return { electionStatus, candidateStatus };
}

function dedupe(ids: ReadonlyArray<ObjectId>): ObjectId[] {
  const seen = new Map<string, ObjectId>();
  for (const id of ids) {
    const key = id?.toString();
    if (key && !seen.has(key)) seen.set(key, id);
  }
  return [...seen.values()];
}
