import type { Db } from "mongodb";
import type { BillVoteValue } from "@/lib/congress/billVoting";
import type { ScopedVoteOfficial } from "@/lib/congress/billVoting";
import {
  scopeStateBillVotesWithOfficials,
  scopeVotesToCurrentSeatHolders,
} from "@/lib/legislature/stateBillVoteScope";
import { toVoteSnapshot } from "@/lib/legislature/voteSnapshot";
import type { PhaseVoteResult, VoteTotals } from "./types";

/**
 * Minimal structural bill shape the vote-core needs — satisfied by both the
 * national `Bill` (`votes`/`otherChamberVotes`) and the regional `StateBill`
 * (`votes`/`overrideVotes`), so both engines resolve through this one path.
 */
export interface PhaseVoteBill {
  votes?: Record<string, BillVoteValue> | undefined;
  otherChamberVotes?: Record<string, BillVoteValue> | undefined;
  overrideVotes?: Record<string, BillVoteValue> | undefined;
  votesFor?: number;
  votesAgainst?: number;
  votesAbstain?: number;
  otherChamberVotesFor?: number;
  otherChamberVotesAgainst?: number;
  otherChamberVotesAbstain?: number;
  overrideVotesFor?: number;
  overrideVotesAgainst?: number;
}

/**
 * Shared vote core for the national and regional bill walkers. Scopes a
 * bill's votes to current seat holders (weighted by seatsHeld), returning
 * scoped totals for the pass/fail decision and a frozen vote snapshot for
 * display. Pass `stateId` for sub-national bills; pass voteField
 * `"overrideVotes"` for veto-override phases. When no current holders
 * survive, freeze the stored aggregate so the snapshot headline matches
 * `totals`.
 */
export async function resolvePhaseVotes(
  db: Db,
  bill: PhaseVoteBill,
  opts: {
    voteField: "votes" | "otherChamberVotes" | "overrideVotes";
    officeType: string;
    countryId: string;
    stateId?: string;
    /** Preloaded current holders; avoids a roster query for every closing bill. */
    officials?: ScopedVoteOfficial[];
  },
  resolvedAtTurn: number
): Promise<PhaseVoteResult> {
  const votes =
    opts.voteField === "otherChamberVotes"
      ? bill.otherChamberVotes
      : opts.voteField === "overrideVotes"
        ? bill.overrideVotes
        : bill.votes;
  const stored: VoteTotals =
    opts.voteField === "otherChamberVotes"
      ? {
          for: bill.otherChamberVotesFor ?? 0,
          against: bill.otherChamberVotesAgainst ?? 0,
          abstain: bill.otherChamberVotesAbstain ?? 0,
        }
      : opts.voteField === "overrideVotes"
        ? {
            for: bill.overrideVotesFor ?? 0,
            against: bill.overrideVotesAgainst ?? 0,
            abstain: 0,
          }
        : {
            for: bill.votesFor ?? 0,
            against: bill.votesAgainst ?? 0,
            abstain: bill.votesAbstain ?? 0,
          };

  const fallback = (): PhaseVoteResult => ({
    totals: stored,
    snapshot: toVoteSnapshot(
      { votes: votes ?? {}, weightMap: new Map(), totals: stored },
      resolvedAtTurn
    ),
  });

  const scoped = opts.officials
    ? {
        ...scopeStateBillVotesWithOfficials(votes, opts.officials, {
          countryId: opts.countryId,
          officeType: opts.officeType,
        }),
        scoped: Object.keys(votes ?? {}).length > 0,
      }
    : await scopeVotesToCurrentSeatHolders(db, votes, {
        countryId: opts.countryId,
        officeType: opts.officeType,
        stateId: opts.stateId,
      });
  // `scoped: false` = no roster lookup was possible (empty map / no valid keys);
  // an empty scoped map = every voter left the seat. Both freeze the stored
  // aggregate so the snapshot headline matches the decision.
  if (!scoped.scoped) return fallback();
  const scopedVotes = scoped.votes ?? {};
  if (Object.keys(scopedVotes).length === 0) return fallback();

  return {
    totals: scoped.totals,
    snapshot: toVoteSnapshot(
      { votes: scopedVotes, weightMap: scoped.weightMap, totals: scoped.totals },
      resolvedAtTurn
    ),
  };
}
