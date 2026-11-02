import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { classifyMarginTier, type MarginTier } from "@/lib/elections/generalViewModel";
import type { CmRace } from "./raceIndex";

/** Who leads a race, by how much, and how safe that is. */

export interface PartyLine {
  partyId: string;
  partyName: string;
  partyAbbr: string;
  partyColor: string;
  share: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Each party's total share in a race, largest first. */
export function partyLines(race: CmRace): PartyLine[] {
  const byParty = new Map<string, PartyLine>();
  for (const c of race.candidates) {
    const line = byParty.get(c.partyId);
    if (line) line.share = r1(line.share + c.share);
    else
      byParty.set(c.partyId, {
        partyId: c.partyId,
        partyName: c.partyName,
        partyAbbr: c.partyAbbr,
        partyColor: c.partyColor,
        share: c.share,
      });
  }
  return [...byParty.values()].sort((a, b) => b.share - a.share);
}

export interface RaceStanding {
  leaderName: string;
  leaderPartyId: string;
  leaderAbbr: string;
  leaderColor: string;
  runnerUpName: string | null;
  margin: number;
  tier: MarginTier;
}

/**
 * The lines a race is read by: parties in a multi-seat general (every slate
 * member lifts the party), candidates everywhere else.
 */
export interface RaceLine {
  id: string;
  name: string;
  partyId: string;
  abbr: string;
  color: string;
  share: number;
}

export function raceLines(race: CmRace): RaceLine[] {
  if (race.multiSeat) {
    return partyLines(race).map((l) => ({
      id: l.partyId,
      name: l.partyName,
      partyId: l.partyId,
      abbr: l.partyAbbr,
      color: l.partyColor,
      share: l.share,
    }));
  }
  return race.candidates.map((c) => ({
    id: c.id,
    name: c.name,
    partyId: c.partyId,
    abbr: c.partyAbbr,
    color: c.partyColor,
    share: c.share,
  }));
}

export function raceStanding(race: CmRace): RaceStanding {
  const lines = raceLines(race);
  const lead = lines[0];
  const second = lines[1];
  const margin = lead ? r1(lead.share - (second?.share ?? 0)) : 0;
  return {
    leaderName: lead?.name ?? "",
    leaderPartyId: lead?.partyId ?? "",
    leaderAbbr: lead?.abbr ?? "",
    leaderColor: lead?.color ?? "",
    runnerUpName: second?.name ?? null,
    margin,
    tier: classifyMarginTier(margin),
  };
}

/** Smallest margin first, the player's race and watched races ahead of the rest. */
export function sortRaces(races: CmRace[], watched: ReadonlySet<string>): CmRace[] {
  const margin = new Map(races.map((r) => [r.key, raceStanding(r).margin]));
  return [...races].sort(
    (a, b) =>
      Number(b.isMine) - Number(a.isMine) ||
      Number(watched.has(b.key)) - Number(watched.has(a.key)) ||
      (margin.get(a.key) ?? 0) - (margin.get(b.key) ?? 0)
  );
}

/**
 * How a region reads on the national map for the races shown. One race: its
 * leader at its tier. Several: the party leading most of them, at `likely`; a
 * tie between parties is a toss-up in the closest race's leader colour.
 */
export function regionFill(regionRaces: CmRace[]): { color: string; tier: MarginTier } | null {
  if (regionRaces.length === 0) return null;
  const standings = regionRaces.map(raceStanding);
  const closest = standings.reduce((a, b) => (b.margin < a.margin ? b : a));
  if (standings.length === 1) return { color: closest.leaderColor, tier: closest.tier };
  const tally = new Map<string, { n: number; color: string }>();
  for (const s of standings) {
    const t = tally.get(s.leaderPartyId);
    if (t) t.n += 1;
    else tally.set(s.leaderPartyId, { n: 1, color: s.leaderColor });
  }
  const ranked = [...tally.values()].sort((a, b) => b.n - a.n);
  if (ranked.length > 1 && ranked[0].n === ranked[1].n) {
    return { color: closest.leaderColor, tier: "tossup" };
  }
  return { color: ranked[0].color, tier: "likely" };
}

export interface SeatSummary {
  majority: number;
  total: number;
  order: Array<{ partyId: string; seats: number }>;
  leaderPartyId: string;
  leaderHasMajority: boolean;
  /** Seats the largest party needs for a majority; 0 when it has one. */
  shortBy: number;
}

export function seatSummary(race: CmRace): SeatSummary | null {
  if (!race.multiSeat || !race.seatsEstimate || !race.totalSeats) return null;
  const order = Object.entries(race.seatsEstimate)
    .filter(([, seats]) => seats > 0)
    .map(([partyId, seats]) => ({ partyId, seats }))
    .sort((a, b) => b.seats - a.seats);
  if (order.length === 0) return null;
  const majority = Math.floor(race.totalSeats / 2) + 1;
  const top = order[0];
  return {
    majority,
    total: race.totalSeats,
    order,
    leaderPartyId: top.partyId,
    leaderHasMajority: top.seats >= majority,
    shortBy: Math.max(0, majority - top.seats),
  };
}

/** One sub-unit's votes as shares, largest first. */
export function subunitShares(
  votesByCandidate: Record<string, number>,
  candidateParties: Record<string, string>
): Array<{ candidateId: string; partyId: string; pct: number }> {
  const total = Object.values(votesByCandidate).reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return [];
  return Object.entries(votesByCandidate)
    .map(([candidateId, votes]) => ({
      candidateId,
      partyId: candidateParties[candidateId] ?? "",
      pct: r1((Math.max(0, votes) / total) * 100),
    }))
    .sort((a, b) => b.pct - a.pct);
}

export type PollingSeries = Array<{ turn: number; shares: Record<string, number> }>;

/**
 * The race's polling by turn, keyed the way `raceLines` keys it. A general
 * reads the tally's turn snapshots; a party primary reads that party's primary
 * snapshots, which carry no turn number, so they are numbered in order.
 */
export function pollingSeries(full: ElectionResponse, race: CmRace): PollingSeries {
  if (race.stage === "primary") {
    const party = race.primaryPartyId ?? "";
    return (full.snapshotHistory ?? [])
      .map((s) => s.byParty?.[party])
      .filter((entries): entries is NonNullable<typeof entries> => !!entries && entries.length > 0)
      .map((entries, i) => ({
        turn: i + 1,
        shares: Object.fromEntries(entries.map((e) => [e.candidateId, e.sharePct])),
      }));
  }
  const partyOf = new Map(race.candidates.map((c) => [c.id, c.partyId]));
  return (full.generalVotes?.turnSnapshots ?? []).map((snap) => {
    if (!race.multiSeat) return { turn: snap.turn, shares: { ...snap.sharesPct } };
    const shares: Record<string, number> = {};
    for (const [cid, pct] of Object.entries(snap.sharesPct)) {
      const party = partyOf.get(cid);
      if (party) shares[party] = r1((shares[party] ?? 0) + pct);
    }
    return { turn: snap.turn, shares };
  });
}

/** Change in a line's share over the last turn; 0 without two turns of data. */
export function lastDelta(series: PollingSeries, lineId: string): number {
  if (series.length < 2) return 0;
  const now = series[series.length - 1].shares[lineId];
  const before = series[series.length - 2].shares[lineId];
  return now == null || before == null ? 0 : r1(now - before);
}

export interface MyRaceSummary {
  /** 1-based place among the race's lines (parties in a multi-seat race). */
  position: number;
  share: number;
  /** Lead over second when leading, gap to first when trailing. */
  gap: number;
  leading: boolean;
  partySeats: number | null;
  totalSeats: number | null;
}

export function myRaceSummary(race: CmRace | undefined): MyRaceSummary | null {
  const me = race?.candidates.find((c) => c.isYou);
  if (!race || !me) return null;
  const lines = raceLines(race);
  const mineId = race.multiSeat ? me.partyId : me.id;
  const idx = lines.findIndex((l) => l.id === mineId);
  const share = lines[idx]?.share ?? 0;
  const leading = idx === 0;
  const gap = leading ? share - (lines[1]?.share ?? 0) : (lines[0]?.share ?? 0) - share;
  return {
    position: idx + 1,
    share,
    gap: r1(gap),
    leading,
    partySeats: race.multiSeat ? (race.seatsEstimate?.[me.partyId] ?? 0) : null,
    totalSeats: race.multiSeat ? race.totalSeats : null,
  };
}
