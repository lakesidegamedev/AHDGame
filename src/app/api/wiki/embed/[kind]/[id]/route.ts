import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api/errors";
import { checkWikiDisabled } from "@/lib/api/wikiGuard";
import { getPartyData } from "@/lib/wiki/partyData";
import { isSequentialId, parsePartySeatsId } from "@/lib/wiki/rules/embedTags";
import type { CountryId } from "@/lib/constants/countries";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporationHistoryCollection } from "@/lib/db/repositories/corporationHistory";

const POINTS = 40;

// cache policy: game-state: public game numbers, no per-user data, short CDN TTL
function publicJson(body: unknown) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120, no-transform" },
  });
}

// GET /api/wiki/embed/[kind]/[id]: compact game data for a wiki embed (party seat counts or a stock price series).
// Auth: public; blocked when wiki is disabled. An unknown id answers { found: false }.
// Errors: 403
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ kind: string; id: string }> }
) {
  try {
    const blocked = await checkWikiDisabled();
    if (blocked) return blocked;
    const { kind, id } = await ctx.params;

    if (kind === "party-seats") {
      const parsed = parsePartySeatsId(id);
      const party = parsed
        ? await getPartyData(String(parsed.sequentialId), parsed.countryId as CountryId)
        : null;
      if (!party) return publicJson({ found: false });
      return publicJson({
        found: true,
        name: party.name,
        color: party.color,
        seats: [
          { label: "House", count: party.seatCounts.house },
          { label: "Senate", count: party.seatCounts.senate },
          { label: "Governors", count: party.seatCounts.governor },
        ],
      });
    }

    if (kind === "stock") {
      if (!isSequentialId(id)) return publicJson({ found: false });
      const db = await getDb();
      const corp = await corporationsCollection(db).findOne(
        { sequentialId: Number(id) },
        { projection: { name: 1, tickerSymbol: 1, isPrivate: 1, sharePrice: 1 } }
      );
      // Private companies keep their price off public pages.
      if (!corp || corp.isPrivate) return publicJson({ found: false });
      const rows = await corporationHistoryCollection(db)
        .aggregate<{ turn: number; sharePrice: number }>([
          { $match: { corporationId: corp._id } },
          { $sort: { turn: -1, createdAt: -1, _id: -1 } },
          { $group: { _id: "$turn", sharePrice: { $first: "$sharePrice" } } },
          { $sort: { _id: -1 } },
          { $limit: POINTS },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, turn: "$_id", sharePrice: 1 } },
        ])
        .toArray();
      return publicJson({
        found: true,
        name: corp.name,
        ticker: corp.tickerSymbol ?? null,
        points: rows,
      });
    }

    return publicJson({ found: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
