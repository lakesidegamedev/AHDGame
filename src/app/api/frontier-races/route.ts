import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/errors";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { loadFundingOptions } from "@/lib/frontierRaces/access";
import { loadFrontierRaceViews } from "@/lib/frontierRaces/service";
import { getDb } from "@/lib/mongodb";

/**
 * GET /api/frontier-races
 * Public leaderboard for the 2040s frontier programme races. A signed-in
 * player with a character also gets the entrants they may fund for.
 */
export async function GET() {
  try {
    const db = await getDb();
    const [races, user] = await Promise.all([
      loadFrontierRaceViews(db),
      getAuthUserWithCharacter(),
    ]);
    const options =
      user?.hasCharacter && user.character
        ? await loadFundingOptions(db, { userId: user.userId, character: user.character })
        : null;
    return NextResponse.json(
      { races, options },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
