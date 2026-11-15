import { NextResponse } from "next/server";
import { requireModerator } from "@/lib/api/requireModerator";
import { handleRouteError } from "@/lib/api/errors";
import { listAchievementsWithEarnedCounts } from "@/lib/achievements/earnedCounts";

// GET /api/moderator/achievements — Lists all achievements with earned counts.
// Auth: requireModerator
// Errors: 403
export async function GET() {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    const list = await listAchievementsWithEarnedCounts();
    return NextResponse.json({ achievements: list });
  } catch (error) {
    return handleRouteError(error);
  }
}
