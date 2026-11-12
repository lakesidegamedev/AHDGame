import type { Db } from "mongodb";
import { ensureIndex } from "./helpers";
import { ensureBoundedNpcCandidateGuards } from "./boundedNpcCandidates";
import { ELECTION_WRITE_GUARD_INDEXES, GOVERNANCE_WRITE_GUARD_INDEXES } from "./writeGuardSpecs";

/**
 * Partial-unique indexes that block double-submit and double-vote races on
 * election entry, endorsements, governance votes, and cabinet/leadership
 * ballot rows. Specs live in `writeGuardSpecs.ts` so the on-demand
 * `/api/admin/migrations/create-indexes` route creates the same set from one
 * source. Idempotent.
 */
export async function seedWriteGuardIndexes(db: Db, log: (msg: string) => void) {
  log("Election write-guard indexes:");
  await ensureBoundedNpcCandidateGuards(db);
  for (const [collection, keys, options] of ELECTION_WRITE_GUARD_INDEXES) {
    await ensureIndex(db, collection, keys, options, log);
  }

  log("Governance write-guard indexes:");
  for (const [collection, keys, options] of GOVERNANCE_WRITE_GUARD_INDEXES) {
    await ensureIndex(db, collection, keys, options, log);
  }

  // NG nominations are queried by role/status and ranked by votes at close,
  // and declaration checks whether this nominee already has an active row.
  await ensureIndex(
    db,
    "ngChamberLeadershipNominations",
    { role: 1, status: 1, votesFor: -1 },
    { name: "ng_leadership_nominations_role_status_votes" },
    log
  );
  await ensureIndex(
    db,
    "ngChamberLeadershipNominations",
    { role: 1, nomineeId: 1, status: 1 },
    { name: "ng_leadership_nominations_role_nominee_status" },
    log
  );

  log("Write-guard indexes ensured");
}
