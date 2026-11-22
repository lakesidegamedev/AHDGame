import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import { loadMoneyHistory, MONEY_HISTORY_MAX_PAGE_SIZE } from "@/lib/character/moneyHistory/load";

// Per-user response with no id in the URL: never let a shared cache keep it.
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" } as const;

const querySchema = z.object({
  cursor: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(MONEY_HISTORY_MAX_PAGE_SIZE).optional(),
  wallet: z.enum(["personal", "campaign"]).optional(),
});

// GET /api/character/money-history: the signed-in player's own money in and out, newest first
// Query: ?cursor=<opaque>&limit=1..100&wallet=personal|campaign
// Auth: requireBasicAuth. The character is always the session's active character.
// Errors: 400, 401, 404
export async function GET(request: Request) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      wallet: url.searchParams.get("wallet") ?? undefined,
    });
    if (!parsed.success) {
      return errorResponse(400, "Invalid query", { headers: PRIVATE_HEADERS });
    }

    const db = await getDb();
    const character = await getCharacterByUserId(db, auth.user.userId);
    if (!character) {
      return errorResponse(404, "Character not found", { headers: PRIVATE_HEADERS });
    }

    const page = await loadMoneyHistory(db, character._id, {
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
      wallet: parsed.data.wallet,
    });
    return NextResponse.json(page, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return handleRouteError(error);
  }
}
