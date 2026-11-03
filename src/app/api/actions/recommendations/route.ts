// GET /api/actions/recommendations - Returns personalized action recommendations for the authenticated user
import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/api/withNoStore";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError } from "@/lib/api/errors";
import { loadRecommendationsForUser } from "@/lib/actions/loadRecommendations";

/**
 * GET /api/actions/recommendations
 *
 * Returns personalized action recommendations based on:
 * - Character stats (actions, funds, influence, favorability, etc.)
 * - Home state economy (unowned sector opportunities)
 * - National economy (large unowned sectors in other states)
 * - Corporation market positions (competitive gaps)
 * - Party treasury and org status
 */
async function handleGET() {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const db = await getDb();
    return NextResponse.json(await loadRecommendationsForUser(db, auth.user.userId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);
