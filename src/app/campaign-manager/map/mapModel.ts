import type { MarginTier } from "@/lib/elections/generalViewModel";
import { classifyMarginTier } from "@/lib/elections/generalViewModel";
import { readableInk, shadeColorForTier } from "@/lib/elections/marginTierShade";
import {
  generalCountySource,
  type CountySource,
} from "@/app/elections/[id]/blend/presMap/countyStore";
import type { CountyApiResponse } from "@/app/elections/[id]/blend/presMap/countyModel";
import type { MapView } from "@/app/elections/[id]/blend/presMap/mapView";
import { subunitShares, type CmRace } from "@/lib/campaignManager/rules";
import type { CampaignGeoRegion } from "./geoSource";

/**
 * Where the map reads a race's sub-units from: the counted results once a
 * general has votes, otherwise a live projection of the race's current shares
 * (a party's primary, or a general before its first count). A finished general
 * reads only its count, never a projection; a finished primary is drawn from
 * its stored result. Null for a primary nobody has entered and for a finished
 * general that counted no votes.
 */
export function countySourceFor(race: CmRace): CountySource | null {
  // Nothing to draw before a race opens or before anyone files.
  if (race.candidates.length === 0 || race.stage === "upcoming") return null;
  const finalGeneral = race.stage === "final" && race.primaryPartyId == null;
  if (finalGeneral) return race.hasPolling ? generalCountySource(race.electionId) : null;
  if (race.stage === "general" && race.hasPolling) return generalCountySource(race.electionId);
  const party = race.stage === "general" ? null : race.primaryPartyId;
  const query = party ? `?party=${encodeURIComponent(party)}` : "";
  return {
    id: `projected:${party ?? "general"}`,
    url: (stateId) =>
      `/api/elections/${race.electionId}/state/${stateId}/projected-subdivisions${query}`,
  };
}

export interface UnitRow {
  id: string;
  name: string;
  path: string;
  fill: string;
  ink: string;
  tier: MarginTier;
  leaderPartyId: string;
  /** Party abbreviation that led the sub-unit's baseline result, when known. */
  baselineLeader?: string;
  shares: Array<{ name: string; partyId: string; color: string; pct: number }>;
}

type Subdivision = CountyApiResponse["subdivisions"][number] & { baselineLeader?: string };

/** One region's results as shaded sub-unit rows on `ground`. */
export function unitRowsFrom(
  data: Omit<CountyApiResponse, "subdivisions"> & { subdivisions: Subdivision[] },
  ground: string
): UnitRow[] {
  const parties = data.candidateParties ?? {};
  const colorOf = (cid: string) =>
    data.candidateColors?.[cid] ?? data.partyColors?.[parties[cid] ?? ""] ?? "#888888";
  return data.subdivisions.map((s) => {
    const counted = subunitShares(s.votes ?? {}, parties).map((x) => ({
      name: data.candidateNames?.[x.candidateId] ?? x.candidateId,
      partyId: x.partyId,
      color: colorOf(x.candidateId),
      pct: x.pct,
    }));
    // Seat-ordered results (a districted House) name each district's winner
    // but carry no votes per district: the seat is decided, so it shades solid.
    const seated = counted.length === 0 && !!s.winner;
    const shares = seated
      ? [
          {
            name: data.candidateNames?.[s.winner] ?? s.winner,
            partyId: parties[s.winner] ?? "",
            color: colorOf(s.winner),
            pct: 100,
          },
        ]
      : counted;
    const margin = shares.length > 1 ? shares[0].pct - shares[1].pct : (shares[0]?.pct ?? 0);
    const tier: MarginTier = seated ? "safe" : classifyMarginTier(margin);
    const leaderColor = shares[0]?.color ?? colorOf(s.winner);
    const fill = shares.length ? shadeColorForTier(leaderColor, tier, ground) : ground;
    return {
      id: s.id,
      name: s.name,
      path: s.path,
      fill,
      ink: readableInk(fill),
      tier,
      leaderPartyId: shares[0]?.partyId ?? parties[s.winner] ?? "",
      ...(s.baselineLeader ? { baselineLeader: s.baselineLeader } : {}),
      shares,
    };
  });
}

/** Regions whose boxes fall inside the part of the map a view shows. */
export function visibleRegions(
  regions: Record<string, CampaignGeoRegion>,
  view: MapView,
  width: number,
  height: number
): string[] {
  const x0 = -view.x / view.k;
  const y0 = -view.y / view.k;
  const x1 = (width - view.x) / view.k;
  const y1 = (height - view.y) / view.k;
  return Object.entries(regions)
    .filter(([, r]) => r.bb[2] >= x0 && r.bb[0] <= x1 && r.bb[3] >= y0 && r.bb[1] <= y1)
    .map(([id]) => id);
}
