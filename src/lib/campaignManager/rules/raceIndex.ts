import type { ElectionResponse, FinishedPrimaryEntry } from "@/lib/elections/electionResponseTypes";
import type { EnrichedCandidate } from "@/lib/elections/candidateEnrichment";
import { primaryCandidateColor } from "./projection";

/**
 * Campaign Manager race index: the elections API's summary rows, reshaped into
 * the rows the Campaign Manager lists. Plain data in, plain data out.
 *
 * A general election is one row. A primary is one row per party, because each
 * party's primary is its own contest with its own shares and its own winner.
 * A finished race (when asked for) is a `final` row, plus one `final` row per
 * party primary its tally kept.
 */

export type CmStage = "upcoming" | "primary" | "general" | "final";
export type CmScope = "national" | "regional";

export interface CmCandidate {
  /** Election-candidate id; the key polling shares and tallies use. */
  id: string;
  /** Character sequential id (URL form), null for an NPP. */
  characterId: string | null;
  /** NPP sequential id (URL form), null for a player. */
  nppId: string | null;
  /** Character ObjectId hex, what the influence routes take; null for an NPP. */
  characterDbId: string | null;
  /** NPP ObjectId hex, what the boost route takes; null for a player. */
  nppDbId: string | null;
  name: string;
  avatarUrl?: string;
  partyId: string;
  partyName: string;
  /** Short party label for chips and margins ("DEM +4.2"). */
  partyAbbr: string;
  partyColor: string;
  /** What the candidate draws in: the party colour, or their own in a primary. */
  color: string;
  share: number;
  favorability: number;
  influence: number;
  isYou: boolean;
  isNPP: boolean;
  /** Who has endorsed the candidate, as the elections API lists them. */
  endorsements: EnrichedCandidate["endorsements"];
}

export interface CmRace {
  /** `electionId` for a general, `${electionId}:${partyId}` for a party primary. */
  key: string;
  electionId: string;
  electionType: string;
  scope: CmScope;
  regionId: string;
  stage: CmStage;
  primaryPartyId: string | null;
  /** The party whose primary this is, named even before anyone files. */
  primaryPartyName: string | null;
  classNum: number | null;
  /** Turns until this stage ends, never negative; null when the race has no turn deadline. */
  turnsLeft: number | null;
  candidates: CmCandidate[];
  /** False for a general whose first votes have not been counted yet. */
  hasPolling: boolean;
  multiSeat: boolean;
  totalSeats: number | null;
  seatsEstimate: Record<string, number> | null;
  isMine: boolean;
  /** Live primary rows: how many from each party advance to the general. */
  advanceCount: number | null;
  /** The race's calendar year; null on legacy rows without a baked year. */
  year: number | null;
  cycle: number;
  seatId: string | null;
  /** Finished rows only: the candidate with the top final share. */
  winnerId: string | null;
}

export interface RaceIndexContext {
  /** Null when the turn could not be read; turns left are then unknown. */
  currentTurn: number | null;
  /** Legislature chamber keys elected nationwide (e.g. `senate`, `house`, `commons`). */
  nationalChamberKeys: readonly string[];
  /** Emit finished races as `final` rows; they are skipped otherwise. */
  includeFinal?: boolean;
  /** Emit races that have not opened as `upcoming` rows (their filers so far). */
  includeUpcoming?: boolean;
}

const VARIANT_PREFIX = /^(snap_|special_)/;

export function raceScope(electionType: string, nationalChamberKeys: readonly string[]): CmScope {
  return nationalChamberKeys.includes(electionType.replace(VARIANT_PREFIX, ""))
    ? "national"
    : "regional";
}

/** "Social Democratic Party" → "SDP"; used only when the party doc gave no abbreviation. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function toCandidate(c: EnrichedCandidate, share: number): CmCandidate {
  return {
    id: c.id,
    characterId: c.characterId,
    nppId: c.nppId,
    characterDbId: c.characterDbId ?? null,
    nppDbId: c.nppDbId ?? null,
    name: c.characterName,
    avatarUrl: c.avatarUrl,
    partyId: c.party,
    partyName: c.partyName,
    partyAbbr: c.partyAbbr || initialsOf(c.partyName),
    partyColor: c.partyColor,
    color: c.partyColor,
    share,
    favorability: c.favorability,
    influence: c.politicalInfluence,
    isYou: c.isYou,
    isNPP: c.isNPP,
    endorsements: c.endorsements ?? [],
  };
}

function turnsUntil(deadline: number | null, currentTurn: number | null): number | null {
  return deadline == null || currentTurn == null ? null : Math.max(0, deadline - currentTurn);
}

const byShare = (a: CmCandidate, b: CmCandidate) => b.share - a.share;

/** Final general shares: the count's last shares, else the counted votes. */
function finalShares(e: ElectionResponse): Record<string, number> | null {
  const polled = e.polling?.sharesPct;
  if (polled && Object.keys(polled).length > 0) return polled;
  const votes = e.generalVotes?.totalVotes;
  if (!votes) return null;
  const total = Object.values(votes).reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  return Object.fromEntries(Object.entries(votes).map(([id, v]) => [id, (v / total) * 100]));
}

/**
 * A finished primary's candidates. Losers may have no candidacy row any more,
 * so a candidate the election no longer lists is rebuilt from the stored
 * result, drawn in their party's colours.
 */
function finishedPrimaryCandidates(
  e: ElectionResponse,
  partyId: string,
  rows: FinishedPrimaryEntry[]
): CmCandidate[] {
  const known = [...(e.allCandidates ?? []), ...e.candidates];
  const partyRef = known.find((c) => c.party === partyId);
  return rows
    .map((r) => {
      const c = known.find((k) => k.id === r.candidateId);
      if (c) return toCandidate(c, r.sharePct);
      const partyName = partyRef?.partyName ?? "";
      return {
        id: r.candidateId,
        characterId: null,
        nppId: null,
        characterDbId: null,
        nppDbId: null,
        name: r.characterName,
        partyId,
        partyName,
        partyAbbr: partyRef?.partyAbbr || initialsOf(partyName),
        partyColor: partyRef?.partyColor ?? "#888888",
        color: partyRef?.partyColor ?? "#888888",
        share: r.sharePct,
        favorability: 0,
        influence: 0,
        isYou: false,
        isNPP: false,
        endorsements: [],
      };
    })
    .sort(byShare)
    .map((c, i) => ({ ...c, color: primaryCandidateColor(c.partyColor, i) }));
}

export function buildRaceIndex(elections: ElectionResponse[], ctx: RaceIndexContext): CmRace[] {
  const races: CmRace[] = [];
  for (const e of elections) {
    // The presidency has its own campaign screen.
    if (e.electionType === "president") continue;
    // Ended races are history, listed only when the caller asks for them.
    if (e.isEnded && !ctx.includeFinal) continue;
    // A race that has not opened is listed only when asked for, with its filers.
    const notOpen = !e.isEnded && !e.inPrimary && !e.inGeneral;
    if (notOpen && !(ctx.includeUpcoming && e.isUpcoming)) continue;
    const scope = raceScope(e.electionType, ctx.nationalChamberKeys);
    const classNum = e.senateClass ?? e.chamberClass ?? null;
    const multiSeat = (e.totalSeats ?? 1) > 1;
    const base = {
      electionId: e.id,
      electionType: e.electionType,
      scope,
      regionId: e.state,
      classNum,
      multiSeat,
      totalSeats: e.totalSeats ?? null,
      year: e.electionYear ?? null,
      cycle: e.cycle,
      seatId: e.seatId ?? null,
      winnerId: null,
      advanceCount: null,
    };

    if (notOpen) {
      races.push({
        ...base,
        key: e.id,
        stage: "upcoming",
        primaryPartyId: null,
        primaryPartyName: null,
        turnsLeft: turnsUntil(e.startTurn, ctx.currentTurn),
        candidates: e.candidates.map((c) => toCandidate(c, 0)),
        hasPolling: false,
        seatsEstimate: null,
        isMine: e.candidates.some((c) => c.isYou),
      });
      continue;
    }

    if (e.isEnded) {
      const shares = finalShares(e);
      const candidates = e.candidates.map((c) => toCandidate(c, shares?.[c.id] ?? 0)).sort(byShare);
      const hasPolling = candidates.some((c) => c.share > 0);
      races.push({
        ...base,
        key: e.id,
        stage: "final",
        primaryPartyId: null,
        primaryPartyName: null,
        turnsLeft: null,
        candidates,
        hasPolling,
        seatsEstimate: multiSeat ? (e.seatsEstimate ?? null) : null,
        isMine: candidates.some((c) => c.isYou),
        winnerId: hasPolling ? candidates[0].id : null,
      });
      races.push(...finishedPrimaryRows(e, base));
      continue;
    }

    if (e.inPrimary) {
      // A primary nobody has entered yet is still a race the player can find
      // and enter: one open row for the election until a party has filers.
      if ((e.byParty ?? []).length === 0) {
        races.push({
          ...base,
          key: e.id,
          stage: "primary",
          advanceCount: e.primaryAdvanceCount ?? 1,
          primaryPartyId: null,
          primaryPartyName: null,
          turnsLeft: turnsUntil(e.primaryEndTurn, ctx.currentTurn),
          candidates: [],
          hasPolling: false,
          multiSeat: false,
          seatsEstimate: null,
          isMine: false,
        });
        continue;
      }
      for (const group of e.byParty ?? []) {
        const candidates = group.candidates
          .map((c) => toCandidate(c, c.sharePct))
          .sort(byShare)
          .map((c, i) => ({ ...c, color: primaryCandidateColor(c.partyColor, i) }));
        races.push({
          ...base,
          key: `${e.id}:${group.partyId}`,
          stage: "primary",
          advanceCount: e.primaryAdvanceCount ?? 1,
          primaryPartyId: group.partyId,
          primaryPartyName: group.partyName,
          turnsLeft: turnsUntil(e.primaryEndTurn, ctx.currentTurn),
          candidates,
          hasPolling: true,
          // Seats are a general-election question.
          multiSeat: false,
          seatsEstimate: null,
          isMine: candidates.some((c) => c.isYou),
        });
      }
      continue;
    }

    const shares = e.polling?.sharesPct ?? null;
    const candidates = e.candidates.map((c) => toCandidate(c, shares?.[c.id] ?? 0)).sort(byShare);
    races.push({
      ...base,
      key: e.id,
      stage: "general",
      primaryPartyId: null,
      primaryPartyName: null,
      turnsLeft: turnsUntil(e.endTurn, ctx.currentTurn),
      candidates,
      hasPolling: shares != null && Object.keys(shares).length > 0,
      seatsEstimate: multiSeat ? (e.seatsEstimate ?? null) : null,
      isMine: candidates.some((c) => c.isYou),
    });
    // A general under way keeps its own finished primaries as history.
    races.push(...finishedPrimaryRows(e, base));
  }
  return races;
}

type RaceBase = Pick<
  CmRace,
  | "electionId"
  | "electionType"
  | "scope"
  | "regionId"
  | "classNum"
  | "multiSeat"
  | "totalSeats"
  | "year"
  | "cycle"
  | "seatId"
  | "winnerId"
  | "advanceCount"
>;

/**
 * One `final` row per party primary the election's tally kept. These rows are
 * history reached from their race (the past-races list, a link), never listed
 * on their own: `filterRaces` leaves them out of every stage.
 */
function finishedPrimaryRows(e: ElectionResponse, base: RaceBase): CmRace[] {
  const out: CmRace[] = [];
  for (const [partyId, rows] of Object.entries(e.primaryResults ?? {})) {
    if (rows.length === 0) continue;
    const pc = finishedPrimaryCandidates(e, partyId, rows);
    out.push({
      ...base,
      key: `${e.id}:${partyId}`,
      stage: "final",
      primaryPartyId: partyId,
      primaryPartyName: pc[0]?.partyName || null,
      turnsLeft: null,
      candidates: pc,
      hasPolling: true,
      multiSeat: false,
      seatsEstimate: null,
      isMine: pc.some((c) => c.isYou),
      winnerId: rows.find((r) => r.won)?.candidateId ?? pc[0]?.id ?? null,
    });
  }
  return out;
}

/** A finished primary row: opened from its race, never listed on its own. */
export function isFinishedPrimary(r: CmRace): boolean {
  return r.stage === "final" && r.primaryPartyId != null;
}

export interface RaceFilter {
  type: string;
  stage: "all" | CmStage;
  /** A region id, or "ALL" for the whole country. */
  regionId: string;
  query: string;
  regionNames: Record<string, string>;
  /** Finished stage only: the election year shown; unset shows every year. */
  year?: number | null;
  /** Primary stage only: one party's primaries; unset shows every party's. */
  party?: string | null;
}

/**
 * Whether a row belongs under a stage: "all" is every live race, a stage its
 * own rows, Finished the year's finished races (every year when `year` is
 * unset). Finished primaries belong under none; they open from their race.
 */
export function inStage(r: CmRace, stage: RaceFilter["stage"], year?: number | null): boolean {
  if (isFinishedPrimary(r)) return false;
  if (stage === "all") return r.stage !== "final";
  if (r.stage !== stage) return false;
  return stage !== "final" || year == null || r.year === year;
}

export function filterRaces(races: CmRace[], f: RaceFilter): CmRace[] {
  const q = f.query.trim().toLowerCase();
  return races.filter((r) => {
    if (r.electionType !== f.type) return false;
    if (!inStage(r, f.stage, f.year)) return false;
    if (f.stage === "primary" && f.party && r.primaryPartyId !== f.party) return false;
    if (f.regionId !== "ALL" && r.regionId !== f.regionId) return false;
    if (!q) return true;
    const region = (f.regionNames[r.regionId] ?? r.regionId).toLowerCase();
    return (
      region.includes(q) ||
      r.regionId.toLowerCase().includes(q) ||
      r.candidates.some((c) => c.name.toLowerCase().includes(q))
    );
  });
}

/** Years with finished races of `type`, newest first. */
export function finishedYears(races: CmRace[], type: string): number[] {
  const years = new Set<number>();
  for (const r of races) {
    if (r.stage === "final" && r.electionType === type && r.year != null) years.add(r.year);
  }
  return [...years].sort((a, b) => b - a);
}

/** The Finished year to show: `current` while `type` still has races then, else the newest. */
export function defaultFinishedYear(
  races: CmRace[],
  type: string,
  current: number | null | undefined
): number | null {
  const years = finishedYears(races, type);
  if (current != null && years.includes(current)) return current;
  return years[0] ?? null;
}
