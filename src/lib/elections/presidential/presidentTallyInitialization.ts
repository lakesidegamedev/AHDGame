import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { ElectionCandidate, ElectionVoteTally, PrimaryResults } from "@/lib/db/types";

import { loadApportionment } from "@/lib/elections/apportionment";

import { COUNTRY_CONFIGS } from "@/lib/constants/countries";

import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { electionsCollection } from "@/lib/db/repositories/elections";

import { electionVoteTalliesCollection } from "@/lib/db/repositories/electionVoteTallies";

/**
 * Initialize a presidential election vote tally with per-unit structure.
 */
export async function initPresidentVoteTally(
  electionId: ObjectId,
  candidates: ElectionCandidate[],
  primaryResults?: PrimaryResults,
  dbOverride?: Db
): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const now = new Date();

  // Unit keys must match the accumulator's country. US-only units seeded
  // into a non-US tally create 56 phantom zero-vote unit keys.
  const election = await electionsCollection(db).findOne(
    { _id: electionId },
    { projection: { countryId: 1 } }
  );
  const countryId = election?.countryId ?? "US";

  let unitIds: string[];
  if (countryId === COUNTRY_CONFIGS.US.id) {
    // Live (census-updated) EV units; equals the seed until a census reapportions
    // (P1d-2). Must match the unit set accumulatePresidentVoteTurn uses.
    const gsDoc = await gameStateCollection<{ _id: string; preset?: string; currentYear?: number }>(
      db
    ).findOne({ _id: "current" }, { projection: { preset: 1, currentYear: 1 } });
    // The live year, not just the preset: the DC (1961) and ME/NE district
    // (1972/1992) gates key on it. Without it a 1953 world at 1965 ran a
    // 530-vote college and never gave DC its three.
    const { electoralVoteUnits } = await loadApportionment(db, gsDoc?.preset, gsDoc?.currentYear);
    unitIds = electoralVoteUnits.map((u) => u.unitId);
  } else {
    // Non-US presidential races accumulate per region/zone keyed by the
    // country's own `states` doc ids (see accumulateNGPresidentVoteTurn).
    const countryStates = await statesCollection(db)
      .find({ countryId }, { projection: { _id: 1 } })
      .toArray();
    unitIds = countryStates.map((s) => s._id as string);
  }

  const totalVotes: Record<string, number> = {};
  const totalVotesByUnit: Record<string, Record<string, number>> = {};
  const candidateNames: Record<string, string> = {};
  const candidateParties: Record<string, string> = {};

  for (const c of candidates) {
    const cid = c._id.toString();
    totalVotes[cid] = 0;
    candidateNames[cid] = c.characterName;
    candidateParties[cid] = c.party;
  }

  for (const unitId of unitIds) {
    totalVotesByUnit[unitId] = {};
    for (const c of candidates) {
      totalVotesByUnit[unitId][c._id.toString()] = 0;
    }
  }

  // Preserve primary-phase fields across the primary→general tally reset so
  // the historical primary map and delegate tally remain visible after the
  // general phase begins. Only the general-phase counters are zeroed.
  const existing = await electionVoteTalliesCollection(db).findOne({ electionId });

  const doc: ElectionVoteTally = {
    // Preserve the matched doc's _id: legacy tallies carry an auto-generated
    // ObjectId, and replaceOne rejects a replacement whose _id differs from
    // the matched document's (immutable-field MongoServerError).
    _id: existing?._id ?? electionId,
    electionId,
    state: "US",
    totalVotes,
    candidateNames,
    candidateParties,
    turnSnapshots: [],
    finalized: false,
    totalVotesByUnit,
    unitTurnSnapshots: {},
    ...(primaryResults && { primaryResults }),
    ...(existing?.primaryStateVotes && { primaryStateVotes: existing.primaryStateVotes }),
    ...(existing?.primaryDelegates && { primaryDelegates: existing.primaryDelegates }),
    ...(existing?.primaryDelegatesByState && {
      primaryDelegatesByState: existing.primaryDelegatesByState,
    }),
    ...(existing?.primaryAllocationByState && {
      primaryAllocationByState: existing.primaryAllocationByState,
    }),
    ...(existing?.primaryWaveHistory && { primaryWaveHistory: existing.primaryWaveHistory }),
    // Keep the wave counter aligned with the preserved history. If the
    // existing tally already advanced the atomic counter, preserve it here
    // too so the "counter == history.length" invariant survives the
    // primary→general re-init and the divergence-warning in
    // `runPrimaryStaggerWaveIfDue` never fires on a clean transition.
    ...(existing?.primaryStaggerWavesRun !== undefined && {
      primaryStaggerWavesRun: existing.primaryStaggerWavesRun,
    }),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await electionVoteTalliesCollection(db).replaceOne({ electionId }, doc, { upsert: true });
}
