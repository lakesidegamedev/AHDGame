import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/errors";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { getAvailableLevers } from "@/lib/crises/levers/queries";
import { getDb } from "@/lib/mongodb";

/**
 * GET /api/crises/levers/available
 * Live Crisis v2 crises where the viewer has a lever to pull, with those levers.
 * Per-user, so never cached.
 * Auth: requireAuthWithCharacter
 */
export async function GET() {
  try {
    const auth = await requireAuthWithCharacter();
    if (!auth.ok) return auth.response;
    const db = await getDb();
    const crises = await getAvailableLevers(db, auth.user.character._id);
    return NextResponse.json({ crises }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
