import {
  distributeSubdivisionVotes,
  type CandidateDistributionInfo,
  type SubdivisionInput,
  type SubdivisionVoteResult,
} from "@/lib/utils/subdivisionResults";

/**
 * Projected sub-unit results for a race in progress: the race's current
 * regional shares, spread across its counties (or constituencies, prefectures)
 * by the same distribution the results routes use for counted votes. Plain
 * data in, plain data out.
 */

export interface ProjectionCandidate {
  id: string;
  partyId: string;
  /** Party abbreviation; matched against the region's baseline party shares. */
  partyAbbr?: string;
  /** Current regional share, percent. All zero before a race's first count. */
  share: number;
  /** Economic position: the party's in a general, the candidate's own in a primary. */
  econ: number;
}

/** Pseudo-vote scale; only the ratios matter. */
const SCALE = 1000;

export function projectSubunits(
  subdivisions: SubdivisionInput[],
  candidates: ProjectionCandidate[],
  mode: "general" | "primary"
): SubdivisionVoteResult[] {
  if (candidates.length === 0) return [];
  // Before the first count every share is zero: an even split leaves only the
  // map's own lean to tell the counties apart.
  const anyShare = candidates.some((c) => c.share > 0);
  const regionVotes: Record<string, number> = {};
  for (const c of candidates) regionVotes[c.id] = anyShare ? Math.max(0, c.share) * SCALE : SCALE;

  const baselineKeys = new Set<string>();
  for (const s of subdivisions)
    for (const k of Object.keys(s.partyShares ?? {})) baselineKeys.add(k);

  // A primary's candidates share one party baseline, so what tells them apart
  // county by county is where each sits against the party's own average.
  const meanEcon =
    mode === "primary" ? candidates.reduce((s, c) => s + c.econ, 0) / candidates.length : 0;
  const info: Record<string, CandidateDistributionInfo> = {};
  for (const c of candidates) {
    info[c.id] =
      mode === "primary"
        ? { econPosition: c.econ - meanEcon }
        : {
            baselineKey: c.partyAbbr && baselineKeys.has(c.partyAbbr) ? c.partyAbbr : undefined,
            econPosition: c.econ,
          };
  }
  return distributeSubdivisionVotes(subdivisions, regionVotes, info);
}

/** A primary's candidates share a party colour; the leader keeps it, the rest take these in order. */
const PRIMARY_PALETTE = ["#8b5cf6", "#10b981", "#f472b6", "#38bdf8", "#fb923c"];

/** The colour a primary candidate draws in, by their place in the primary (0 = leader). */
export function primaryCandidateColor(partyColor: string, index: number): string {
  return index === 0 ? partyColor : PRIMARY_PALETTE[(index - 1) % PRIMARY_PALETTE.length];
}
