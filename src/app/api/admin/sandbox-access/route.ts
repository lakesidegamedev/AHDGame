import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { createAdminLog } from "@/lib/adminLog";
import type { GameConfig } from "@/lib/db/types";

const patchSchema = z.object({ enabled: z.boolean() });

// GET /api/admin/sandbox-access: state of the sandbox tester access switch
// Auth: requireAdmin
export const GET = withAdminRoute(async (_auth) => {
  const db = await getDb();
  const config = await db
    .collection<GameConfig>("gameConfig")
    .findOne({ _id: "default" }, { projection: { sandboxTesterAccessEnabled: 1 } });
  return NextResponse.json({ enabled: config?.sandboxTesterAccessEnabled === true });
});

// PATCH /api/admin/sandbox-access: flip `gameConfig.sandboxTesterAccessEnabled`
// Auth: requireAdmin. Off (default) leaves sandbox access to staff and supporters.
export const PATCH = withAdminRoute(async (auth, request: Request) => {
  const parsed = await parseJsonBody(request, patchSchema);
  if (!parsed.success) return errorResponse(parsed.status, parsed.error);

  const { enabled } = parsed.data;
  const db = await getDb();
  await db
    .collection<GameConfig>("gameConfig")
    .updateOne(
      { _id: "default" },
      { $set: { sandboxTesterAccessEnabled: enabled } },
      { upsert: true }
    );
  await createAdminLog({
    category: "system",
    action: enabled ? "sandbox_tester_access_enabled" : "sandbox_tester_access_disabled",
    username: auth.admin.username,
    adminUsername: auth.admin.username,
  });
  return NextResponse.json({ enabled });
});
