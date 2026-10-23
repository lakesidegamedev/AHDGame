import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import type { GameState } from "@/lib/db/types";

// GET /api/admin/conflicts/cold-war/toggle - Read the Cold War subsystem flag.
// Auth: requireAdmin
// Errors: 403
export const GET = withAdminRoute(async (_auth) => {
  const db = await getDb();
  const gameState = await db.collection<GameState>("gameState").findOne(
    { _id: "current" },
    {
      projection: {
        coldWarEnabled: 1,
        coldWarEnabledBy: 1,
        coldWarEnabledAt: 1,
      },
    }
  );
  return NextResponse.json({
    enabled: gameState?.coldWarEnabled ?? false,
    enabledBy: gameState?.coldWarEnabledBy,
    enabledAt: gameState?.coldWarEnabledAt,
  });
});

// POST /api/admin/conflicts/cold-war/toggle - Refused: this legacy flag is retired.
// The live conflict system uses conflictsEnabled as its single master gate.
// Auth: requireAdmin
// Errors: 403, 409
export const POST = withAdminRoute(async (_auth) => {
  return errorResponse(
    409,
    "The legacy coldWarEnabled flag is retired. Use conflictsEnabled for the live conflict system."
  );
});
