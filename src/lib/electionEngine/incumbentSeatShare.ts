/*
 * Prior-cycle seat-share lookup for the swing-flow incumbency driver.
 *
 * Multi-seat proportional races model incumbency as a per-party seat-share
 * map, since "incumbent" is not a single ID. Races with their own officeholder
 * incumbency path must NOT use this map: single-winner executives use the
 * approval curve (`incumbentPartyId`) and the US Senate uses the flat shield
 * (`legislativeIncumbentPartyId`), both of which go quiet on a vacant seat.
 * Using the vote split there would turn a vacant race into a meaningless
 * margin-scaled value. The exclusion is enforced inside
 * `getIncumbentSeatShareByParty` via {@link usesSeatShareIncumbency}.
 */

import type { Db } from "mongodb";
import type { Election, ElectionVoteTally } from "@/lib/db/types";
import { getElectionSeatKey } from "@/lib/turn/autoReelectionEntry";
import { SINGLE_WINNER_EXECUTIVE_ELECTION_TYPES } from "@/lib/constants/countries";
import { isSingleSeatLegislativeRace } from "./singleSeatIncumbency";

/**
 * False for the races that have a dedicated OFFICEHOLDER incumbency path, so
 * they must never fall back to a prior-cycle vote split:
 *   - single-winner executives ({@link SINGLE_WINNER_EXECUTIVE_ELECTION_TYPES})
 *     — the `incumbentPartyId` approval curve
 *   - the US Senate ({@link isSingleSeatLegislativeRace}) — the
 *     `legislativeIncumbentPartyId` flat shield
 *
 * For those races `totalVotes` is a two-way vote split, not a seat split, so
 * the map would price a margin nobody in the current race earned. Crucially,
 * when the seat is VACANT both officeholder paths are correctly unset, and the
 * driver must then read 0 (open seat) — NOT fall through to this map.
 *
 * Regression this guards (live FL Governor, cycle 5): a vacant FL Governor seat
 * left `incumbentPartyId` unset, so the driver read the prior race's 72/28
 * vote split as a seat share and handed a party that had never held the office
 * a -7.2pt "Incumbency" drag.
 *
 * True otherwise — chambers whose seats are allocated from vote share (US
 * House, UK Regional Council, JP Shugiin/Sangiin, DE Bundestag, …), where the
 * map's entries really are seats each party is defending.
 *
 * KNOWN RESIDUAL, deliberately not covered here: a race can be multi-seat by
 * TYPE but single-seat in one region (US House in a one-district state such as
 * VT / WY / AK; BR `chamber`, seeded at `totalSeats: 1`). There the map also
 * degenerates to a vote split. It is left alone because, unlike a vacant
 * executive seat, those races have a real sitting incumbent, so zeroing the
 * driver would remove incumbency rather than correct it — a balance change
 * needing its own issue and simulation report, not a defect fix. Gate on
 * `totalSeats` here if that is ever taken on.
 */
export function usesSeatShareIncumbency(election: Election): boolean {
  if (SINGLE_WINNER_EXECUTIVE_ELECTION_TYPES.has(election.electionType)) return false;
  // Country-scoped: BR reuses the "senate" type for 3-seat PR races, which DO
  // want the map. `isSingleSeatLegislativeRace` already makes that distinction.
  if (isSingleSeatLegislativeRace(election)) return false;
  return true;
}

/**
 * Compute per-party vote share from a resolved tally's raw votes. Pure
 * function — exported for unit testing without a database.
 *
 * Sums each party's candidates' votes, normalizes by the grand total.
 * Returns a Map summing to 1.0 (within rounding) when totalVotes is
 * positive, empty Map otherwise.
 */
export function computeSeatShareFromTally(
  totalVotes: Record<string, number>,
  candidateParties: Record<string, string>
): Map<string, number> {
  const partyVotes = new Map<string, number>();
  let grandTotal = 0;
  for (const [candidateId, votes] of Object.entries(totalVotes)) {
    if (!Number.isFinite(votes) || votes <= 0) continue;
    const party = candidateParties[candidateId];
    if (!party) continue;
    partyVotes.set(party, (partyVotes.get(party) ?? 0) + votes);
    grandTotal += votes;
  }
  if (grandTotal <= 0) return new Map();
  const shares = new Map<string, number>();
  for (const [party, votes] of partyVotes) {
    shares.set(party, votes / grandTotal);
  }
  return shares;
}

/** STV incumbency follows seats actually won, not non-transferable first-preference shares. */
export function incumbentShareFromFinalizedTally(tally: ElectionVoteTally): Map<string, number> {
  if (tally.countingMethod === "pr_stv") {
    if (tally.resolutionPath !== "pr_stv" || !tally.seatsEstimate) return new Map();
    return computeSeatShareFromTally(tally.seatsEstimate, tally.candidateParties);
  }
  return computeSeatShareFromTally(tally.totalVotes, tally.candidateParties);
}

/**
 * Look up the prior-cycle seat-share map for a given election. Returns
 * an empty Map when there is no prior resolved election on the same
 * seat key (first-ever race, no historical data, etc.) — the swing-flow
 * driver treats an empty map as "no incumbent" and returns 0.
 *
 * Strategy:
 *   0. Bail out for races that must not use a seat-share map at all
 *      ({@link usesSeatShareIncumbency}).
 *   1. Compute the current election's seat key.
 *   2. Find resolved elections sharing the same seat key, prior cycle.
 *   3. Take the most-recent one's `ElectionVoteTally`.
 *   4. Reduce to per-party vote-share via `computeSeatShareFromTally`.
 */
export async function getIncumbentSeatShareByParty(
  election: Election,
  db: Db
): Promise<Map<string, number>> {
  // Guarded here rather than at each call site so no caller can reintroduce
  // the single-winner fallback by forgetting the check. Also saves the two
  // round-trips below on every executive / US Senate race.
  if (!usesSeatShareIncumbency(election)) return new Map();

  const seatKey = getElectionSeatKey(election);

  // Find resolved elections in this country+state in prior cycles. We
  // intentionally do NOT filter on `electionType` in the DB query: snap
  // elections (`snap_commons`, `snap_bundestag`, `snap_shugiin`) share a
  // seat key with their regular counterparts (`commons` / `bundestag` /
  // `shugiin`) via `getElectionSeatKey`'s canonicalization through
  // `officeKeyForElectionType`. A snap-followed-by-regular cycle on the
  // same seat must match. The in-memory `find` filter below applies the
  // canonical seat-key match.
  const priorElections = await db
    .collection<Election>("elections")
    .find({
      countryId: election.countryId ?? "US",
      state: election.state,
      status: "resolved",
      cycle: { $lt: election.cycle },
    })
    .sort({ cycle: -1 })
    .toArray();

  const prior = priorElections.find((p) => getElectionSeatKey(p) === seatKey);
  if (!prior) return new Map();

  const tally = await db
    .collection<ElectionVoteTally>("electionVoteTallies")
    .findOne({ electionId: prior._id });
  if (!tally || !tally.finalized) return new Map();

  return incumbentShareFromFinalizedTally(tally);
}

/**
 * Incumbent seat share for every election in one pass (#2695).
 *
 * Same selection as `getIncumbentSeatShareByParty`: the most recent resolved
 * election in an earlier cycle for the same country, state and canonical seat
 * key, and its finalized tally. Resolved history cannot change while votes
 * accumulate (resolution is a later phase), so the answer is the same as the
 * per-election read, at two queries per turn instead of two per election.
 * Every input election gets an entry, empty when there is no qualifying prior.
 */
export async function preloadIncumbentSeatShares(
  elections: readonly Election[],
  db: Db
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  const eligible = elections.filter((election) => {
    if (usesSeatShareIncumbency(election)) return true;
    result.set(election._id.toString(), new Map());
    return false;
  });
  if (eligible.length === 0) return result;

  const states = [...new Set(eligible.map((election) => election.state))];
  const resolved = await db
    .collection<Election>("elections")
    .find({ status: "resolved", state: { $in: states } })
    .sort({ cycle: -1 })
    .toArray();

  const priorByElection = new Map<string, Election>();
  for (const election of eligible) {
    const countryId = election.countryId ?? "US";
    const seatKey = getElectionSeatKey(election);
    const prior = resolved.find(
      (p) =>
        p.countryId === countryId &&
        p.state === election.state &&
        p.cycle < election.cycle &&
        getElectionSeatKey(p) === seatKey
    );
    if (prior) priorByElection.set(election._id.toString(), prior);
    else result.set(election._id.toString(), new Map());
  }
  if (priorByElection.size === 0) return result;

  const tallies = await db
    .collection<ElectionVoteTally>("electionVoteTallies")
    .find({ electionId: { $in: [...priorByElection.values()].map((p) => p._id) } })
    .toArray();
  const tallyByElection = new Map<string, ElectionVoteTally>();
  for (const tally of tallies) {
    const key = tally.electionId.toString();
    if (!tallyByElection.has(key)) tallyByElection.set(key, tally);
  }
  for (const [electionId, prior] of priorByElection) {
    const tally = tallyByElection.get(prior._id.toString());
    result.set(
      electionId,
      !tally || !tally.finalized ? new Map() : incumbentShareFromFinalizedTally(tally)
    );
  }
  return result;
}
