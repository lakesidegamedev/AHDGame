import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { getGameStateCollection } from "@/lib/db/collections";

// POST /api/admin/turn/toggle-player-transfers - Toggles player-to-player transfer blocking on/off.
// Auth: requireAdmin
// Errors: 403, 404
export const POST = withAdminRoute(async (_auth) => {
  const db = await getDb();
  const col = await getGameStateCollection(db);
  const gameState = await col.findOne({ _id: "current" });

  if (!gameState) {
    return errorResponse(404, "Game state not initialized");
  }

  const newValue = !(gameState.playerTransfersPaused ?? false);

  await col.updateOne(
    { _id: "current" },
    { $set: { playerTransfersPaused: newValue, updatedAt: new Date() } }
  );

  return NextResponse.json({
    success: true,
    playerTransfersPaused: newValue,
    message: newValue
      ? "Player-to-player transfers paused - direct character and party transfers will be blocked"
      : "Player-to-player transfers resumed - direct character and party transfers will run normally",
  });
});
