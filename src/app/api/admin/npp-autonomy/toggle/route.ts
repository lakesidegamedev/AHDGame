import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import type { GameState } from "@/lib/db/types";

const bodySchema = z.object({ enabled: z.boolean() });

/**
 * GET /api/admin/npp-autonomy/toggle
 * Read the current NPP-autonomy flag state. Auth: requireAdmin.
 */
export const GET = withAdminRoute(async (_auth) => {
  const db = await getDb();
  const doc = await db
    .collection<GameState>("gameState")
    .findOne({ _id: "current" }, { projection: { nppAutonomyEnabled: 1 } });

  return NextResponse.json({ nppAutonomyEnabled: doc?.nppAutonomyEnabled === true });
});

/**
 * POST /api/admin/npp-autonomy/toggle
 * Flip the smarter-NPP autonomy system on/off. When on, NPP-autonomy behaviors
 * activate ONLY in disabled/econ-only countries (gated by isNppAutonomyActive).
 * Auth: requireAdmin
 */
export const POST = withAdminRoute(async (auth, request: Request) => {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.success) {
    return errorResponse(parsed.status, parsed.error);
  }

  const db = await getDb();
  const now = new Date().toISOString();
  // Keep the new 4-state level in sync so it (which wins on read) never goes
  // stale behind this legacy boolean toggle: enable → "v0", disable → "off".
  const set: Partial<GameState> = {
    nppAutonomyEnabled: parsed.data.enabled,
    nppAutonomyLevel: parsed.data.enabled ? "v0" : "off",
    updatedAt: new Date(),
  };
  if (parsed.data.enabled) {
    set.nppAutonomyEnabledBy = auth.admin.username;
    set.nppAutonomyEnabledAt = now;
  }

  await db
    .collection<GameState>("gameState")
    .updateOne(
      { _id: "current" },
      parsed.data.enabled
        ? { $set: set }
        : { $set: set, $unset: { nppAutonomyEnabledBy: "", nppAutonomyEnabledAt: "" } }
    );

  return NextResponse.json({ success: true, nppAutonomyEnabled: parsed.data.enabled });
});
