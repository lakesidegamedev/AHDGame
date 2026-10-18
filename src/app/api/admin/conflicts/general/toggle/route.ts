import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import type { GameState } from "@/lib/db/types";

const bodySchema = z.object({ enabled: z.boolean() });

// GET /api/admin/conflicts/general/toggle - Read the Conflicts subsystem flag.
// Auth: requireAdmin
// Errors: 403
export const GET = withAdminRoute(async (_auth) => {
  const db = await getDb();
  const gameState = await db.collection<GameState>("gameState").findOne(
    { _id: "current" },
    {
      projection: {
        conflictsEnabled: 1,
        conflictsEnabledBy: 1,
        conflictsEnabledAt: 1,
      },
    }
  );
  return NextResponse.json({
    enabled: gameState?.conflictsEnabled ?? false,
    enabledBy: gameState?.conflictsEnabledBy,
    enabledAt: gameState?.conflictsEnabledAt,
  });
});

// POST /api/admin/conflicts/general/toggle - Enable/disable the Conflicts subsystem.
// When enabled, the World navbar surfaces the Conflicts link / page.
// Auth: requireAdmin
// Errors: 400, 403
export const POST = withAdminRoute(async (auth, request: Request) => {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.success) {
    return errorResponse(parsed.status, parsed.error);
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const set: Partial<GameState> = {
    conflictsEnabled: parsed.data.enabled,
    updatedAt: new Date(),
  };
  if (parsed.data.enabled) {
    set.conflictsEnabledBy = auth.admin.username;
    set.conflictsEnabledAt = now;
  }

  await db.collection<GameState>("gameState").updateOne(
    { _id: "current" },
    parsed.data.enabled
      ? { $set: set }
      : {
          $set: set,
          $unset: {
            conflictsEnabledBy: "",
            conflictsEnabledAt: "",
          },
        }
  );

  return NextResponse.json({
    success: true,
    conflictsEnabled: parsed.data.enabled,
  });
});
