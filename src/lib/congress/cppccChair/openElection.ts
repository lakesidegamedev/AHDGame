/**
 * Chairman of the CPPCC election opener — CN parallel of the NPCSC Chair
 * opener (src/lib/congress/npcscChair/openElection.ts), modeled on the US
 * House Majority Leader: `largest-single-party` eligibility, so only the
 * largest NPC party (the CCP) may declare/vote. The CPPCC advisory body is
 * appointed and not modeled as an electable roster, so the electorate is the
 * CCP's seated NPC delegates (reusing the NPC composition).
 *
 * Called from the CN NPC general-election resolution path once seats are
 * reconciled. Idempotent — a duplicate call while an election is live is a
 * no-op.
 */
import { ObjectId } from "mongodb";
import type { Db } from "@/lib/mongodb";
import { getPartyMap } from "@/lib/db/partyMap";
import { getGameTime } from "@/lib/time/gameTime";
import { isLeadershipElectionClosed } from "@/lib/congress/leadershipElections";
import { getNpcComposition } from "@/lib/congress/npcComposition";
import {
  buildChamberLeadershipContext,
  isPartyEligible,
  POLICY_BY_ROLE,
} from "@/lib/congress/leadership/rolePolicy";
import type {
  CppccChairElection,
  CppccChairNomination,
  CongressLeader,
  ElectedOfficial,
} from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { congressLeadersCollection } from "@/lib/db/repositories/congressLeaders";
import { cppccChairNominationsCollection } from "@/lib/db/repositories/cppccChairNominations";
import { cppccChairElectionsCollection } from "@/lib/db/repositories/cppccChairElections";

const ELECTION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours — parity with US Speaker

/**
 * Open a fresh 24-hour Chairman of the CPPCC election. Idempotent: if an
 * active election is already in progress (status === "voting" and not yet
 * expired), this is a no-op.
 */
export async function triggerCppccChairElectionAfterReconcile(db: Db, now: Date): Promise<void> {
  const existing = await cppccChairElectionsCollection(db).findOne({ _id: "current" });
  const currentTurn = (await getGameTime()).currentTurn;
  if (existing?.status === "voting" && !isLeadershipElectionClosed(existing, currentTurn, now)) {
    return; // already running — leave it
  }

  // Clear any stale nominations from a prior cycle.
  await cppccChairNominationsCollection(db).updateMany(
    { status: { $in: ["open", "voting"] } },
    { $set: { status: "failed", updatedAt: now } }
  );

  const endsAt = new Date(now.getTime() + ELECTION_DURATION_MS);
  const endsOnTurn = currentTurn + ELECTION_DURATION_MS / 3_600_000;
  await cppccChairElectionsCollection(db).updateOne(
    { _id: "current" },
    {
      $set: {
        _id: "current",
        status: "voting",
        startedAt: now,
        endsAt,
        endsOnTurn,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  // Auto-nominate the incumbent if they still hold an NPC seat and remain
  // eligible under the chair_cppcc policy (largest single party).
  const partyMap = await getPartyMap(db, "CN");
  const npc = await getNpcComposition(db, partyMap);
  const policy = POLICY_BY_ROLE.chair_cppcc;
  const chamberCtx = buildChamberLeadershipContext({
    composition: npc.composition,
    majorityParty: npc.majorityParty,
    majorityBloc: npc.majorityBloc,
  });

  const incumbent = await congressLeadersCollection(db).findOne({ role: "chair_cppcc" });

  if (incumbent?.characterId) {
    const hasSeat = await electedOfficialsCollection(db).findOne({
      officeType: "npcDelegate",
      characterId: incumbent.characterId,
      countryId: "CN",
    });
    if (hasSeat) {
      const char = await charactersCollection(db).findOne(
        { _id: incumbent.characterId },
        { projection: { party: 1, homeState: 1, name: 1 } }
      );
      const incumbentParty = char?.party ?? incumbent.party ?? null;
      if (incumbentParty && isPartyEligible(policy, incumbentParty, chamberCtx)) {
        await cppccChairNominationsCollection(db).insertOne({
          _id: new ObjectId(),
          nomineeId: incumbent.characterId,
          nomineeName: incumbent.characterName,
          nomineeParty: incumbentParty,
          nomineeCountryId: "CN",
          nomineeState: char?.homeState ?? hasSeat.state ?? undefined,
          nominatedById: incumbent.characterId,
          nominatedByName: "Incumbent",
          status: "voting",
          votesFor: 0,
          votesAgainst: 0,
          votes: {},
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  console.log(
    `[Turn] Chairman of the CPPCC election opened after reconciliation (ends ${endsAt.toISOString()})`
  );
}
