import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import type {
  Election,
  ElectionCandidate,
  ElectionVoteTally,
  GameState,
  PoliticalParty,
} from "@/lib/db/types";
import { resolveElectionRouteParam } from "@/lib/elections/electionParamResolution";
import { adjacentElectionsQuery } from "@/lib/elections/resolveElection";
import { cycleAnchorContextFromGameState } from "@/lib/elections/cycleAnchorContext";
import { resolveElectionYear } from "@/lib/utils/formatters";
import {
  orderSeatCycles,
  summarizeSeatCycle,
  type SeatCycleInput,
} from "@/lib/campaignManager/rules";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

type SeatElection = Pick<
  Election,
  | "_id"
  | "countryId"
  | "electionType"
  | "cycle"
  | "electionYear"
  | "senateClass"
  | "chamberClass"
  | "status"
>;
type SeatTally = Pick<
  ElectionVoteTally,
  "electionId" | "totalVotes" | "candidateNames" | "candidateParties" | "primaryResults"
>;

// GET /api/elections/[id]/seat-history — every cycle of one seat, newest
// first, with each finished cycle's winner and margin and its finished
// primaries. Feeds Campaign Manager's Previous / Next arrows and past-races
// list. `[id]` is an election ObjectId or a seat slug.
// Auth: public (finished results and the seat's schedule only)
// Errors: 400, 404
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) return errorResponse(400, "Invalid election id");

    const db = await getDb();
    const resolved = await resolveElectionRouteParam(db, parsed.data.id);
    if (!resolved.ok) {
      return errorResponse(resolved.reason === "invalid_id" ? 400 : 404, "Election not found");
    }

    const elections = await db
      .collection<Election>("elections")
      .find(adjacentElectionsQuery(resolved.election))
      .project<SeatElection>({
        _id: 1,
        countryId: 1,
        electionType: 1,
        cycle: 1,
        electionYear: 1,
        senateClass: 1,
        chamberClass: 1,
        status: 1,
      })
      .toArray();
    const ids: ObjectId[] = elections.map((e) => e._id);

    const [candidates, tallies] = await Promise.all([
      db
        .collection<ElectionCandidate>("electionCandidates")
        .find({ electionId: { $in: ids } })
        .project<Pick<ElectionCandidate, "_id" | "electionId" | "characterName" | "party">>({
          _id: 1,
          electionId: 1,
          characterName: 1,
          party: 1,
        })
        .toArray(),
      db
        .collection<ElectionVoteTally>("electionVoteTallies")
        .find({ electionId: { $in: ids } })
        .project<SeatTally>({
          electionId: 1,
          totalVotes: 1,
          candidateNames: 1,
          candidateParties: 1,
          primaryResults: 1,
        })
        .toArray(),
    ]);

    const partyIds = new Set<number>();
    for (const c of candidates) partyIds.add(Number(c.party));
    for (const t of tallies) {
      for (const p of Object.values(t.candidateParties ?? {})) partyIds.add(Number(p));
    }
    const countryId = resolved.election.countryId;
    const [parties, gameState] = await Promise.all([
      db
        .collection<PoliticalParty>("politicalParties")
        .find({
          ...(countryId ? { countryId } : {}),
          sequentialId: { $in: [...partyIds].filter(Number.isFinite) },
        })
        .project<Pick<PoliticalParty, "sequentialId" | "name" | "abbreviation" | "color">>({
          sequentialId: 1,
          name: 1,
          abbreviation: 1,
          color: 1,
        })
        .toArray(),
      // Only legacy rows without a baked year need the preset's anchors.
      elections.some((e) => e.electionYear == null)
        ? db.collection<GameState>("gameState").findOne(
            { _id: "current" },
            {
              projection: { startingYear: 1, preset: 1, preIterationTurns: 1, preIteration: 1 },
            }
          )
        : Promise.resolve(null),
    ]);

    const ctx = cycleAnchorContextFromGameState(gameState);
    const partyMap: SeatCycleInput["parties"] = {};
    for (const p of parties) {
      partyMap[String(p.sequentialId)] = { name: p.name, abbr: p.abbreviation, color: p.color };
    }
    const tallyBy = new Map(tallies.map((t) => [t.electionId.toHexString(), t]));
    const candidatesBy = new Map<string, SeatCycleInput["candidates"]>();
    for (const c of candidates) {
      const key = c.electionId.toHexString();
      const list = candidatesBy.get(key) ?? [];
      list.push({ id: c._id.toHexString(), name: c.characterName, partyId: String(c.party) });
      candidatesBy.set(key, list);
    }

    const cycles = elections.map((e) => {
      const key = e._id.toHexString();
      const tally = tallyBy.get(key);
      // The tally names every candidate it counted (NPPs included); filed
      // candidates fill in for a race with no tally yet.
      const tallied = Object.entries(tally?.candidateNames ?? {}).map(([id, name]) => ({
        id,
        name,
        partyId: String(tally?.candidateParties?.[id] ?? ""),
      }));
      return summarizeSeatCycle({
        electionId: key,
        cycle: e.cycle,
        year: resolveElectionYear(e, ctx),
        status: e.status,
        candidates: tallied.length > 0 ? tallied : (candidatesBy.get(key) ?? []),
        parties: partyMap,
        totalVotes: tally?.totalVotes ?? null,
        primaryResults: tally?.primaryResults?.byParty ?? null,
      });
    });

    return NextResponse.json({ cycles: orderSeatCycles(cycles) });
  } catch (error) {
    return handleRouteError(error);
  }
}
