import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { createAdminLog } from "@/lib/adminLog";
import type { GameConfig } from "@/lib/db/types";

const patchSchema = z.object({
  enabled: z.boolean(),
});

// GET /api/admin/config/line-of-credit — LOC feature flag (player central-bank loans)
// Auth: requireAdmin
// Errors: 403
export const GET = withAdminRoute(async (_auth) => {
  const db = await getDb();
  const config = await db
    .collection<GameConfig>("gameConfig")
    .findOne({ _id: "default" }, { projection: { lineOfCreditEnabled: 1 } });

  const enabled = config?.lineOfCreditEnabled !== false;

  return NextResponse.json({ enabled });
});

// PATCH /api/admin/config/line-of-credit — Enable or disable player line-of-credit
// Auth: requireAdmin
// Errors: 400, 403
export const PATCH = withAdminRoute(async (auth, request: Request) => {
  const parsed = await parseJsonBody(request, patchSchema);
  if (!parsed.success) {
    return errorResponse(parsed.status, parsed.error);
  }

  const { enabled } = parsed.data;

  const db = await getDb();
  await db
    .collection<GameConfig>("gameConfig")
    .updateOne({ _id: "default" }, { $set: { lineOfCreditEnabled: enabled } }, { upsert: true });

  await createAdminLog({
    category: "system",
    action: enabled ? "line_of_credit_enabled" : "line_of_credit_disabled",
    username: auth.admin.username,
    adminUsername: auth.admin.username,
    details: enabled
      ? "Player line-of-credit (central bank loans) is enabled."
      : "Player line-of-credit (central bank loans) is disabled.",
  });

  return NextResponse.json({ success: true, enabled });
});
