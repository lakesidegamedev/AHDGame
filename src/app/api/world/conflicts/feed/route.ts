/**
 * GET /api/world/conflicts/feed
 *
 * Every live conflict as a card needs it: name, region, dated span, severity rung,
 * front-line status line, and casualty count. This is the richer sibling of
 * `/api/world/conflicts` (which returns only the picker DTO) and it feeds the merged
 * Global feed on the crises page, where wars sit alongside global crises.
 *
 * Public, like the conflicts hub.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api/errors";
import { listActiveConflicts } from "@/lib/db/collections/conflicts";
import { casualtiesByTheater } from "@/lib/db/collections/battleReports";
import { getGameTime } from "@/lib/time/gameTime";
import { toConflictView } from "@/app/world/conflicts/_coldwar/conflictView";

export async function GET() {
  try {
    const db = await getDb();
    const { currentYear, startingYear, preIterationTurns } = await getGameTime();

    const docs = await listActiveConflicts(db);
    const casualties = await casualtiesByTheater(
      db,
      docs.map((d) => d._id)
    );
    const conflicts = docs.map((d) =>
      toConflictView(d, { startingYear, casualties: casualties[d._id] ?? 0, preIterationTurns })
    );

    return NextResponse.json({ conflicts, year: currentYear ?? startingYear });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/world/conflicts/feed" });
  }
}
