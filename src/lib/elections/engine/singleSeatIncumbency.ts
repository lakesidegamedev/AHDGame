/**
 * Officeholder-based incumbency resolution for single-seat legislative races
 * (US Senate). Finds the sitting senator, guards against open seats (the
 * incumbent must actually be running), and counts their consecutive terms in
 * the seat. Feeds the flat-shield branch of `incumbencyDriver`.
 */

import type { Db } from "mongodb";
import type {
  Election,
  ElectionCandidate,
  ElectionVoteTally,
  ElectedOfficial,
} from "@/lib/db/types";
import { getElectionSeatKey } from "@/lib/turn/autoReelectionEntry";
import { getMultiSeatMinShare } from "@/lib/elections/resolution/seatAllocation";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { electionsCollection } from "@/lib/db/repositories/elections";

/**
 * True for single-winner legislative races that use the officeholder-based flat
 * incumbency shield. US Senate only for now; other single-winner legislative
 * offices can be added here. Executives (governor/president) and multi-seat
 * proportional chambers are intentionally excluded.
 */
export function isSingleSeatLegislativeRace(election: Election): boolean {
  // Country-scoped: BR reuses the literal "senate" electionType for its
  // 3-seats-per-state regional Senate races, which are multi-seat PR and must
  // NOT take the US flat-shield / single-winner branches (they would skip the
  // seat-share incumbency path and mis-route resolution sweeps).
  return (
    election.electionType === "senate" &&
    countryHasFeature("usElections", election.countryId ?? "US")
  );
}

/**
 * Same-person identity within a seat's history: characterId when present, else
 * nppId. Returns null when neither is set.
 */
function identityOf(rec: {
  characterId?: { toString(): string } | null;
  nppId?: { toString(): string } | null;
}): string | null {
  return rec.characterId?.toString() ?? rec.nppId?.toString() ?? null;
}

/**
 * Consecutive terms = current term (1) plus each leading prior winner whose
 * identity matches the incumbent, stopping at the first mismatch or null.
 * `orderedPriorWinnerIdentities` must be newest → oldest.
 */
export function computeConsecutiveTermsFromWinners(
  incumbentIdentity: string,
  orderedPriorWinnerIdentities: (string | null)[]
): number {
  let terms = 1;
  for (const winner of orderedPriorWinnerIdentities) {
    if (winner && winner === incumbentIdentity) terms += 1;
    else break;
  }
  return terms;
}

/** Winner identity of a resolved election from sweep-preloaded history. */
function getElectionWinnerIdentity(
  election: Election,
  tallyByElection: ReadonlyMap<string, ElectionVoteTally>,
  candidatesByElection: ReadonlyMap<string, readonly ElectionCandidate[]>
): string | null {
  const electionId = election._id.toString();
  const tally = tallyByElection.get(electionId);
  if (!tally || !tally.finalized) return null;

  let winnerCandidateId: string | undefined;
  let maxVotes = -Infinity;
  for (const [candidateId, votes] of Object.entries(tally.totalVotes)) {
    if (typeof votes === "number" && votes > maxVotes) {
      maxVotes = votes;
      winnerCandidateId = candidateId;
    }
  }
  if (winnerCandidateId == null) return null;

  const candidates = candidatesByElection.get(electionId) ?? [];
  const winner = candidates.find((c) => c._id.toString() === winnerCandidateId);
  return winner ? identityOf(winner) : null;
}

interface IncumbencyHistory {
  resolvedElections: Election[];
  tallyByElection: Map<string, ElectionVoteTally>;
  candidatesByElection: Map<string, ElectionCandidate[]>;
}

async function loadIncumbencyHistory(
  resolvedElections: Election[],
  db: Db
): Promise<Omit<IncumbencyHistory, "resolvedElections">> {
  const electionIds = resolvedElections.map((election) => election._id);
  if (electionIds.length === 0) {
    return { tallyByElection: new Map(), candidatesByElection: new Map() };
  }
  const [tallies, candidates] = await Promise.all([
    db
      .collection<ElectionVoteTally>("electionVoteTallies")
      .find(
        { electionId: { $in: electionIds } },
        { projection: { electionId: 1, finalized: 1, totalVotes: 1 } }
      )
      .toArray(),
    db
      .collection<ElectionCandidate>("electionCandidates")
      .find(
        { electionId: { $in: electionIds } },
        { projection: { electionId: 1, characterId: 1, nppId: 1 } }
      )
      .toArray(),
  ]);
  const candidatesByElection = new Map<string, ElectionCandidate[]>();
  for (const candidate of candidates) {
    const electionId = candidate.electionId.toString();
    const rows = candidatesByElection.get(electionId) ?? [];
    rows.push(candidate);
    candidatesByElection.set(electionId, rows);
  }
  return {
    tallyByElection: new Map(tallies.map((tally) => [tally.electionId.toString(), tally])),
    candidatesByElection,
  };
}

function priorElectionsForSeat(election: Election, resolvedElections: readonly Election[]) {
  const seatKey = getElectionSeatKey(election);
  return resolvedElections
    .filter(
      (prior) =>
        (prior.countryId ?? "US") === (election.countryId ?? "US") &&
        prior.state === election.state &&
        prior.cycle < election.cycle &&
        getElectionSeatKey(prior) === seatKey
    )
    .sort((a, b) => b.cycle - a.cycle);
}

function resolveSingleSeatFromHistory(
  election: Election,
  runningCandidateIdentities: ReadonlySet<string>,
  official: ElectedOfficial | undefined,
  history: IncumbencyHistory
): { incumbentPartyId: string; tenureTerms: number } | null {
  if (!isSingleSeatLegislativeRace(election) || !official?.party) return null;
  const incumbentIdentity = identityOf(official);
  if (!incumbentIdentity || !runningCandidateIdentities.has(incumbentIdentity)) return null;
  const winnerIdentities = priorElectionsForSeat(election, history.resolvedElections).map((prior) =>
    getElectionWinnerIdentity(prior, history.tallyByElection, history.candidatesByElection)
  );
  return {
    incumbentPartyId: official.party,
    tenureTerms: computeConsecutiveTermsFromWinners(incumbentIdentity, winnerIdentities),
  };
}

/**
 * Resolve the sitting senator for `election`'s seat and their consecutive-term
 * count, or null when the race is out of scope, the seat is vacant, or the
 * incumbent is not among `runningCandidateIdentities` (open seat).
 */
export async function resolveSingleSeatLegislativeIncumbent(
  election: Election,
  runningCandidateIdentities: Set<string>,
  db: Db
): Promise<{ incumbentPartyId: string; tenureTerms: number } | null> {
  if (!isSingleSeatLegislativeRace(election)) return null;

  const countryId = election.countryId ?? "US";
  const filter: Record<string, unknown> = {
    officeType: "senate",
    state: election.state,
    countryId,
  };
  if (election.senateClass) filter.senateClass = election.senateClass;

  const official = await electedOfficialsCollection(db).findOne(filter);
  if (!official || !official.party) return null;

  const resolvedElections = await electionsCollection(db)
    .find({ countryId, state: election.state, electionType: "senate", status: "resolved" })
    .toArray();
  const loaded = await loadIncumbencyHistory(resolvedElections, db);
  return resolveSingleSeatFromHistory(election, runningCandidateIdentities, official, {
    resolvedElections,
    ...loaded,
  });
}

// ─── US House (multi-seat) incumbency ───────────────────────────────────────
//
// The single-seat pattern does not extend to the House. A state's delegation is
// one Election with `totalSeats` > 1, so several parties' nominees are "the
// incumbent" for their own slice, and there is no persisted tenure counter:
// `ElectedOfficial` house rows are rewritten every cycle and
// `CongressionalDistrict.holderCharacterId` exists only when redistricting is on.
//
// Tenure is therefore tracked per candidate identity (characterId/nppId), not per
// party or district. A returning nominee carries their own consecutive-term
// count; a brand-new nominee for the same party starts at first term, matching
// the single-seat guard above.
//
// History is read from `electionVoteTallies`. Multi-seat "winning" depends on the
// seat-allocation formula, not raw vote rank, so this reuses the vote-share gate
// the allocator applies (`getMultiSeatMinShare`): clearing it counts as holding a
// seat that cycle. That is a proxy, which is enough because counting consecutive
// terms needs only a boolean per cycle.
//
// Known simplification: the allocator pools a party's nominees before the gate
// and this measures each candidate alone, so two nominees each under the gate but
// over it combined would be recorded as having no tenure. No US House race has
// fielded more than one nominee per party; pooling would be a balance change.

/** Bounds the historical walk-back: personalStatTenureRetention saturates at
 *  PERSONAL_STAT_TENURE_EROSION_MAX/PERSONAL_STAT_TENURE_EROSION_PER_TERM = 5
 *  terms beyond the first, so looking back further can never change the
 *  erosion applied — this just bounds the DB work for a race with a very long
 *  resolved history. Kept above that saturation point so a recalibration of
 *  either constant does not silently truncate the count. */
const MAX_HOUSE_TENURE_LOOKBACK = 12;

function resolveHouseFromHistory(
  election: Election,
  runningIdentityToCandidateId: ReadonlyMap<string, string>,
  history: IncumbencyHistory
): Map<string, number> {
  const result = new Map<string, number>();
  if (election.electionType !== "house" || runningIdentityToCandidateId.size === 0) {
    return result;
  }

  const countryId = election.countryId ?? "US";
  const priorsOnSeat = priorElectionsForSeat(election, history.resolvedElections).slice(
    0,
    MAX_HOUSE_TENURE_LOOKBACK
  );
  if (priorsOnSeat.length === 0) return result;

  const clearedByCycle = priorsOnSeat.map((prior) => {
    const minShare = getMultiSeatMinShare("house", prior.totalSeats, countryId);
    const cleared = new Set<string>();
    const electionId = prior._id.toString();
    const tally = history.tallyByElection.get(electionId);
    if (!tally?.finalized) return cleared;
    const totalVotes = Object.values(tally.totalVotes).reduce(
      (sum, votes) => sum + (typeof votes === "number" && Number.isFinite(votes) ? votes : 0),
      0
    );
    if (totalVotes <= 0) return cleared;
    for (const candidate of history.candidatesByElection.get(electionId) ?? []) {
      const identity = identityOf(candidate);
      if (!identity) continue;
      const votes = tally.totalVotes[candidate._id.toString()];
      if (typeof votes === "number" && votes / totalVotes >= minShare) cleared.add(identity);
    }
    return cleared;
  });

  for (const [identity, candidateId] of runningIdentityToCandidateId) {
    let terms = 0;
    for (const cleared of clearedByCycle) {
      if (cleared.has(identity)) terms += 1;
      else break;
    }
    if (terms > 0) result.set(candidateId, terms);
  }
  return result;
}

/**
 * Per-candidate consecutive-term counts for a US House race, keyed by THIS
 * CYCLE's candidateId (`ElectionCandidate._id.toString()`, matching
 * `EnrichedCandidate.candidateId`) — one entry per still-running candidate
 * identity that held a seat (cleared the multi-seat vote-share gate) last
 * cycle, walking further back while the same identity keeps clearing it.
 * Absent from the map ⇒ first term / new nominee / open district ⇒ the
 * caller applies no fatigue (see the module doc comment above for why this
 * differs in shape from `resolveSingleSeatLegislativeIncumbent`).
 *
 * `runningIdentityToCandidateId` maps this cycle's candidate identities
 * (characterId/nppId `.toString()`) to their `ElectionCandidate._id.toString()`
 * — the caller already has both from the same `candidates` array used to
 * resolve the single-seat case.
 */
export async function resolveHouseIncumbentTenures(
  election: Election,
  runningIdentityToCandidateId: Map<string, string>,
  db: Db
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (election.electionType !== "house" || runningIdentityToCandidateId.size === 0) {
    return result;
  }

  const countryId = election.countryId ?? "US";
  const resolvedElections = await electionsCollection(db)
    .find({ countryId, state: election.state, electionType: "house", status: "resolved" })
    .toArray();
  const loaded = await loadIncumbencyHistory(resolvedElections, db);
  return resolveHouseFromHistory(election, runningIdentityToCandidateId, {
    resolvedElections,
    ...loaded,
  });
}

export interface LegislativeIncumbencyPreload {
  singleSeatByElection: Map<string, { incumbentPartyId: string; tenureTerms: number } | null>;
  houseTenuresByElection: Map<string, Map<string, number>>;
}

/**
 * Resolve every legislative incumbency input for an election sweep with four
 * bounded reads, independent of election count and history depth.
 */
export async function preloadLegislativeIncumbencies(
  elections: readonly Election[],
  candidatesByElection: ReadonlyMap<string, readonly ElectionCandidate[]>,
  db: Db
): Promise<LegislativeIncumbencyPreload> {
  const relevant = elections.filter(
    (election) => isSingleSeatLegislativeRace(election) || election.electionType === "house"
  );
  const singleSeatByElection = new Map<
    string,
    { incumbentPartyId: string; tenureTerms: number } | null
  >();
  const houseTenuresByElection = new Map<string, Map<string, number>>();
  if (relevant.length === 0) return { singleSeatByElection, houseTenuresByElection };

  const countries = [...new Set(relevant.map((election) => election.countryId ?? "US"))];
  const states = [
    ...new Set(relevant.map((election) => election.state).filter(Boolean)),
  ] as string[];
  const [resolvedElections, officials] = await Promise.all([
    electionsCollection(db)
      .find({
        countryId: { $in: countries },
        state: { $in: states },
        electionType: { $in: ["senate", "house"] },
        status: "resolved",
      })
      .toArray(),
    electedOfficialsCollection(db)
      .find(
        { countryId: { $in: countries }, state: { $in: states }, officeType: "senate" },
        {
          projection: {
            countryId: 1,
            officeType: 1,
            state: 1,
            senateClass: 1,
            characterId: 1,
            nppId: 1,
            party: 1,
          },
        }
      )
      .toArray(),
  ]);
  const loaded = await loadIncumbencyHistory(resolvedElections, db);
  const history: IncumbencyHistory = { resolvedElections, ...loaded };

  for (const election of relevant) {
    const electionId = election._id.toString();
    const runningCandidates = candidatesByElection.get(electionId) ?? [];
    if (isSingleSeatLegislativeRace(election)) {
      const runningIdentities = new Set(
        runningCandidates
          .map((candidate) => identityOf(candidate))
          .filter((identity): identity is string => identity != null)
      );
      const official = officials.find(
        (row) =>
          row.officeType === "senate" &&
          row.state === election.state &&
          (row.countryId ?? "US") === (election.countryId ?? "US") &&
          (!election.senateClass || row.senateClass === election.senateClass)
      );
      singleSeatByElection.set(
        electionId,
        resolveSingleSeatFromHistory(election, runningIdentities, official, history)
      );
    }
    if (election.electionType === "house") {
      const runningIdentityToCandidateId = new Map<string, string>();
      for (const candidate of runningCandidates) {
        const identity = identityOf(candidate);
        if (identity) runningIdentityToCandidateId.set(identity, candidate._id.toString());
      }
      houseTenuresByElection.set(
        electionId,
        resolveHouseFromHistory(election, runningIdentityToCandidateId, history)
      );
    }
  }
  return { singleSeatByElection, houseTenuresByElection };
}
