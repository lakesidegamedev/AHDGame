/**
 * POST /api/admin/elections/snap-timers
 *
 * Re-anchors each future timer so it lands exactly when its turn fires.
 *
 * Turns process at the top of each hour. A timer set to an arbitrary
 * wall-clock time (e.g. "now + 72h") can land mid-turn, so the LARP week
 * shown to players may be one turn off.
 *
 * snapped = nextScheduledTurn + (turnsLeft - 1) * 1h
 *
 * The turn count remaining is preserved; only minute/second is zeroed.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { getGameTime } from "@/lib/time/gameTime";
import type { Election, GameState } from "@/lib/db/types";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { electionsCollection } from "@/lib/db/repositories/elections";

const TURN_MS = 60 * 60 * 1000; // turns fire every hour

// POST /api/admin/elections/snap-timers — Re-anchors all active election timers to exact turn-fire boundaries to eliminate sub-turn drift.
// Auth: requireAdmin
// Errors: 403, 404
export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();

    const gameState = await gameStateCollection(db).findOne({ _id: "current" });

    if (!gameState) {
      return errorResponse(404, "Game state not found");
    }

    // Use the game clock for the "now" reference so timer arithmetic agrees
    // with how readers evaluate primaryEndTime/endTime. nextScheduledTurn is
    // already a game-clock-aware anchor produced by the turn scheduler.
    const gameTime = await getGameTime();
    const now = gameTime.effectiveNow;

    // Use nextScheduledTurn as the first upcoming turn boundary.
    // Fall back to computing the next top-of-hour if the scheduler is paused.
    const nextTurn: Date = gameState.nextScheduledTurn
      ? new Date(gameState.nextScheduledTurn)
      : (() => {
          const t = new Date(now);
          t.setMinutes(0, 0, 0);
          t.setHours(t.getHours() + 1);
          return t;
        })();

    // Fetch every active (non-completed) election that still has a future timer.
    const elections = await electionsCollection(db)
      .find({
        status: { $in: ["active", "upcoming"] },
        $or: [{ endTime: { $gt: now } }, { primaryEndTime: { $gt: now } }],
      })
      .toArray();

    if (elections.length === 0) {
      return NextResponse.json({ message: "No active elections with future timers found." });
    }

    const updates: {
      filter: { _id: Election["_id"] };
      update: { $set: Record<string, Date> };
    }[] = [];

    // Audit timestamp stays on the real wall clock; comparisons against
    // election fields use the game-clock `now` defined above.
    const updatedAt = new Date();
    for (const election of elections) {
      const set: Record<string, Date> = { updatedAt };

      if (election.primaryEndTime && election.primaryEndTime > now) {
        const msLeft = election.primaryEndTime.getTime() - now.getTime();
        const turnsLeft = Math.max(1, Math.ceil(msLeft / TURN_MS));
        set.primaryEndTime = new Date(nextTurn.getTime() + (turnsLeft - 1) * TURN_MS);
      }

      if (election.endTime && election.endTime > now) {
        const msLeft = election.endTime.getTime() - now.getTime();
        const turnsLeft = Math.max(1, Math.ceil(msLeft / TURN_MS));
        set.endTime = new Date(nextTurn.getTime() + (turnsLeft - 1) * TURN_MS);
      }

      // Only queue an update if something actually changed.
      if ("primaryEndTime" in set || "endTime" in set) {
        updates.push({ filter: { _id: election._id }, update: { $set: set } });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: "All timers are already aligned — nothing to update." });
    }

    await electionsCollection(db).bulkWrite(
      updates.map(({ filter, update }) => ({ updateOne: { filter, update } }))
    );

    return NextResponse.json({
      message: `Snapped ${updates.length} election timer${updates.length !== 1 ? "s" : ""} to turn boundaries. Next turn: ${nextTurn.toLocaleTimeString()}.`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
