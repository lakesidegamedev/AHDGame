/**
 * Coalition refusals: parties that will not govern with one another.
 *
 * A refusal is directed (`refuser` will not govern with `refused`) but it
 * blocks the pairing either way, since a cabinet needs both to sit in it.
 * Parties are named by abbreviation so authored data survives a reseed that
 * renumbers sequential ids.
 *
 * Refusals are not permanent. A refuser that keeps losing while the party it
 * shuns leads the chamber comes under pressure to drop the line: after
 * {@link REFUSAL_LAPSE_LOSSES} consecutive election losses under those
 * conditions, each further losing election rolls {@link REFUSAL_LAPSE_CHANCE}
 * to lapse it. The roll is a hash of the refusal and the election, so a
 * replayed turn reaches the same answer.
 */

export interface CoalitionRefusal {
  /** Abbreviation of the party that refuses. */
  refuser: string;
  /** Abbreviation of the party it refuses to govern with. */
  refused: string;
  /** Consecutive elections the refuser lost while `refused` led. */
  consecutiveLosses: number;
}

/**
 * Authored refusals for one party. `refuses` lists the parties it will not
 * govern with; `shunnedBy` lists the parties that will not govern with it.
 */
export interface CoalitionRefusalSeed {
  party: string;
  refuses?: readonly string[];
  shunnedBy?: readonly string[];
}

export const REFUSAL_LAPSE_LOSSES = 2;
export const REFUSAL_LAPSE_CHANCE = 0.5;

/** Expand authored seeds into directed refusals, deduplicated. */
export function expandRefusalSeeds(seeds: readonly CoalitionRefusalSeed[]): CoalitionRefusal[] {
  const out: CoalitionRefusal[] = [];
  const seen = new Set<string>();
  const add = (refuser: string, refused: string) => {
    const key = `${refuser}>${refused}`;
    if (refuser === refused || seen.has(key)) return;
    seen.add(key);
    out.push({ refuser, refused, consecutiveLosses: 0 });
  };
  for (const seed of seeds) {
    for (const refused of seed.refuses ?? []) add(seed.party, refused);
    for (const refuser of seed.shunnedBy ?? []) add(refuser, seed.party);
  }
  return out;
}

/** True when either party refuses to govern with the other. */
export function refusalBlocks(
  refusals: readonly CoalitionRefusal[],
  a: string,
  b: string
): boolean {
  return refusals.some(
    (r) => (r.refuser === a && r.refused === b) || (r.refuser === b && r.refused === a)
  );
}

/** Deterministic value in [0, 1) from a string key (FNV-1a). */
export function refusalLapseRoll(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

export interface RefusalElectionInput {
  refusals: readonly CoalitionRefusal[];
  /** Seats by party abbreviation after the previous evaluated election. */
  previousSeats: Readonly<Record<string, number>>;
  /** Seats by party abbreviation after this election. */
  currentSeats: Readonly<Record<string, number>>;
  /** Stable id of this election, folded into the lapse roll. */
  electionKey: string;
  /** Scope for the roll, normally the country id. */
  scope: string;
}

export interface RefusalElectionResult {
  refusals: CoalitionRefusal[];
  lapsed: CoalitionRefusal[];
}

/**
 * Advance every refusal by one election. A refuser "loses" when it holds
 * fewer seats than after the previous election; the refused party "leads"
 * when it alone holds the most seats.
 */
export function advanceRefusalsAfterElection(input: RefusalElectionInput): RefusalElectionResult {
  const seats = (abbr: string) => input.currentSeats[abbr] ?? 0;
  const top = Math.max(0, ...Object.values(input.currentSeats));
  const leaders = Object.keys(input.currentSeats).filter((abbr) => seats(abbr) === top);
  const refusals: CoalitionRefusal[] = [];
  const lapsed: CoalitionRefusal[] = [];
  for (const refusal of input.refusals) {
    const lost = seats(refusal.refuser) < (input.previousSeats[refusal.refuser] ?? 0);
    const refusedLeads = top > 0 && leaders.length === 1 && leaders[0] === refusal.refused;
    const consecutiveLosses = lost && refusedLeads ? refusal.consecutiveLosses + 1 : 0;
    const next = { ...refusal, consecutiveLosses };
    const roll = refusalLapseRoll(
      `${input.scope}|${refusal.refuser}|${refusal.refused}|${input.electionKey}`
    );
    if (consecutiveLosses >= REFUSAL_LAPSE_LOSSES && roll < REFUSAL_LAPSE_CHANCE) {
      lapsed.push(next);
    } else {
      refusals.push(next);
    }
  }
  return { refusals, lapsed };
}
