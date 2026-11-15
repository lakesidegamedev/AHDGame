import { STAGE_ACCOUNTABILITY_WEIGHT } from "./accountability";
import { clamp, type AccountabilityEntry, type CrisisRole } from "./types";

/** Severity below which sitting on a lever is not held against anyone. */
export const BLAME_SEVERITY_FLOOR = 40;
/** Idle turns count this much more than the same weight of acting counts for. */
export const BLAME_WEIGHT = 2;
/** Net score at which the swing reaches about three quarters of its bound. */
export const VERDICT_SCALE = 8;
/** Most approval points one crisis moves for one holder, either way. */
export const MAX_APPROVAL_POINTS = 4;
/** Vote-share percent in the holder's party a point of approval is worth. */
export const ELECTION_PCT_PER_APPROVAL_POINT = 0.5;
/** Most vote-share percent crisis blame shifts for one party in one place. */
export const MAX_PARTY_ELECTION_PCT = 3;
/** Turns a party's crisis election shift stays in force. */
export const ELECTION_SHIFT_TURNS = 48;

export interface HolderVerdict {
  role: CrisisRole;
  holderId: string;
  /** Mitigation delivered, weighted by stage and by how severe the crisis was. */
  credit: number;
  /** Idle turns at high severity, weighted by stage. */
  blame: number;
  /** Approval points to apply: positive is credit, negative is blame. */
  approvalDelta: number;
}

/**
 * Turns the accountability ledger into a verdict per holder. Acting counts for
 * more the worse the crisis was; sitting on a lever only counts once severity is
 * above the floor, and counts more the higher it climbs.
 */
export function judgeHolders(ledger: readonly AccountabilityEntry[]): HolderVerdict[] {
  const verdicts = new Map<string, HolderVerdict>();
  for (const entry of ledger) {
    const key = `${entry.role}:${entry.holderId}`;
    const verdict = verdicts.get(key) ?? {
      role: entry.role,
      holderId: entry.holderId,
      credit: 0,
      blame: 0,
      approvalDelta: 0,
    };
    const weight = STAGE_ACCOUNTABILITY_WEIGHT[entry.stage];
    if (entry.leverId === null) {
      const excess = (entry.severity - BLAME_SEVERITY_FLOOR) / (100 - BLAME_SEVERITY_FLOOR);
      verdict.blame += weight * clamp(excess, 0, 1);
    } else {
      verdict.credit += weight * entry.mitigation * (entry.severity / 100);
    }
    verdicts.set(key, verdict);
  }
  for (const verdict of verdicts.values()) {
    const net = verdict.credit - verdict.blame * BLAME_WEIGHT;
    verdict.approvalDelta = Math.tanh(net / VERDICT_SCALE) * MAX_APPROVAL_POINTS;
  }
  return [...verdicts.values()].filter((verdict) => Math.abs(verdict.approvalDelta) >= 0.05);
}

/** Vote-share percent shift a holder's party gets from one verdict. */
export function partyElectionPct(approvalDelta: number): number {
  return approvalDelta * ELECTION_PCT_PER_APPROVAL_POINT;
}

/** Sums party shifts and bounds the total, so a crowded ledger cannot swamp an election. */
export function boundPartyShift(totalPct: number): number {
  return clamp(totalPct, -MAX_PARTY_ELECTION_PCT, MAX_PARTY_ELECTION_PCT);
}
