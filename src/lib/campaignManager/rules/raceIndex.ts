import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import type { EnrichedCandidate } from "@/lib/elections/candidateEnrichment";

/**
 * Campaign Manager race index: the elections API's summary rows, reshaped into
 * the rows the Campaign Manager lists. Plain data in, plain data out.
 *
 * A general election is one row. A primary is one row per party, because each
 * party's primary is its own contest with its own shares and its own winner.
 */

export type CmStage = "primary" | "general";
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
  share: number;
  favorability: number;
  influence: number;
  isYou: boolean;
  isNPP: boolean;
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
}

export interface RaceIndexContext {
  /** Null when the turn could not be read; turns left are then unknown. */
  currentTurn: number | null;
  /** Legislature chamber keys elected nationwide (e.g. `senate`, `house`, `commons`). */
  nationalChamberKeys: readonly string[];
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
    share,
    favorability: c.favorability,
    influence: c.politicalInfluence,
    isYou: c.isYou,
    isNPP: c.isNPP,
  };
}

function turnsUntil(deadline: number | null, currentTurn: number | null): number | null {
  return deadline == null || currentTurn == null ? null : Math.max(0, deadline - currentTurn);
}

const byShare = (a: CmCandidate, b: CmCandidate) => b.share - a.share;

export function buildRaceIndex(elections: ElectionResponse[], ctx: RaceIndexContext): CmRace[] {
  const races: CmRace[] = [];
  for (const e of elections) {
    // The presidency has its own campaign screen; ended races are history.
    if (e.electionType === "president" || e.isEnded) continue;
    // A race that has not opened has no stage to show yet.
    if (!e.inPrimary && !e.inGeneral) continue;
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
    };

    if (e.inPrimary) {
      for (const group of e.byParty ?? []) {
        const candidates = group.candidates.map((c) => toCandidate(c, c.sharePct)).sort(byShare);
        races.push({
          ...base,
          key: `${e.id}:${group.partyId}`,
          stage: "primary",
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
  }
  return races;
}

export interface RaceFilter {
  type: string;
  stage: "all" | CmStage;
  /** A region id, or "ALL" for the whole country. */
  regionId: string;
  query: string;
  regionNames: Record<string, string>;
}

export function filterRaces(races: CmRace[], f: RaceFilter): CmRace[] {
  const q = f.query.trim().toLowerCase();
  return races.filter((r) => {
    if (r.electionType !== f.type) return false;
    if (f.stage !== "all" && r.stage !== f.stage) return false;
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
