import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { resolveElectionRouteParam } from "@/lib/elections/electionParamResolution";
import { resolveElection } from "@/lib/elections/resolveElection";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { getSubdivisionMode } from "@/lib/maps/subdivisionConfig";
import { loadSubdivisionFile } from "@/lib/maps/subdivisionData";
import { loadCountyPopulationMap } from "@/lib/counties/queries";
import {
  primaryCandidateColor,
  projectSubunits,
  type ProjectionCandidate,
} from "@/lib/campaignManager/rules";

// GET /api/elections/[id]/state/[stateId]/projected-subdivisions[?party=ID] —
// a race in progress, projected sub-unit by sub-unit from its current shares:
// the general's polling, or (with `party`) that party's primary. Same response
// shape as subdivision-results, so a map reads either. Works before a race has
// counted votes, when subdivision-results has nothing to show.
// Auth: public (built from public race shares)
// Errors: 400, 404
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stateId: string }> }
) {
  try {
    const { id, stateId } = await params;
    const regionId = stateId.toUpperCase();
    // regionId feeds a filesystem path — region-code shapes only.
    if (!/^[A-Z]{2,3}$/.test(regionId)) return errorResponse(400, "Invalid region ID");
    const party = req.nextUrl.searchParams.get("party");
    if (party != null && !/^[\w-]{1,32}$/.test(party)) return errorResponse(400, "Invalid party");

    const db = await getDb();
    const resolved = await resolveElectionRouteParam(db, id);
    if (!resolved.ok) {
      return resolved.reason === "invalid_id"
        ? errorResponse(400, "Invalid election ID")
        : errorResponse(404, "Election not found");
    }
    const election = resolved.election;
    const modeEntry = getSubdivisionMode(election.countryId, String(election.electionType));
    if (!modeEntry)
      return errorResponse(404, "Sub-unit map data is not available for this election");

    const populationCountryId = modeEntry.config.populationCountryId;
    const file = await loadSubdivisionFile(modeEntry.config.dataDir, regionId, {
      preset: await getGameStatePresetOrDefault(db),
      ...(populationCountryId && election.status === "active"
        ? { countyPopulations: await loadCountyPopulationMap(db, regionId, populationCountryId) }
        : {}),
    });
    if (!file) return errorResponse(404, "Sub-unit map data not available for this region");

    const race = await resolveElection(db, election, { view: "summary", userId: null });
    if (!race) return errorResponse(404, "Election not found");

    let mode: "general" | "primary";
    let cands: ProjectionCandidate[];
    const candidateNames: Record<string, string> = {};
    const candidateParties: Record<string, string> = {};
    const partyColors: Record<string, string> = {};
    const candidateColors: Record<string, string> = {};
    if (party != null) {
      const group = race.byParty?.find((g) => g.partyId === party);
      if (!group || group.candidates.length === 0)
        return errorResponse(404, "Party not in this primary");
      mode = "primary";
      const ordered = [...group.candidates].sort((a, b) => b.sharePct - a.sharePct);
      cands = ordered.map((c) => ({
        id: c.id,
        partyId: party,
        share: c.sharePct,
        econ: c.economicPosition,
      }));
      ordered.forEach((c, i) => {
        candidateNames[c.id] = c.characterName;
        candidateParties[c.id] = party;
        candidateColors[c.id] = primaryCandidateColor(group.partyColor, i);
      });
      partyColors[party] = group.partyColor;
    } else {
      mode = "general";
      const shares = race.polling?.sharesPct ?? {};
      cands = race.candidates.map((c) => ({
        id: c.id,
        partyId: c.party,
        partyAbbr: c.partyAbbr,
        share: shares[c.id] ?? 0,
        econ: c.partyEcon,
      }));
      for (const c of race.candidates) {
        candidateNames[c.id] = c.characterName;
        candidateParties[c.id] = c.party;
        partyColors[c.party] = c.partyColor;
      }
    }

    const projected = projectSubunits(file.subdivisions, cands, mode);
    const subById = new Map(file.subdivisions.map((s) => [s.id, s]));
    return NextResponse.json({
      viewBox: file.viewBox,
      mode: "projected",
      unitLabel: modeEntry.config.unitLabel ?? "Subdivision",
      unitLabelPlural: modeEntry.config.unitLabelPlural ?? "Subdivisions",
      subdivisions: projected.map((r) => {
        const src = subById.get(r.id);
        const baseline = Object.entries(src?.partyShares ?? {}).sort(([, a], [, b]) => b - a)[0];
        return {
          ...r,
          path: src?.path ?? "",
          ...(baseline ? { baselineLeader: baseline[0] } : {}),
        };
      }),
      candidateNames,
      candidateParties,
      partyColors,
      ...(mode === "primary" ? { candidateColors } : {}),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
