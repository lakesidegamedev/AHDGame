import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { handleRouteError } from "@/lib/api/errors";
import { botApiKeysCollection } from "@/lib/db/repositories/botApiKeys";
import type { Document } from "mongodb";
import { botApiRequestLogCollection } from "@/lib/db/repositories/botApiRequestLog";

// GET /api/admin/bot-api-keys - Lists active bot API keys and recent bot API request logs for admins.
// Auth: requireAdmin
// Errors: 403
export const GET = withAdminAuth(async () => {
  try {
    const db = await getDb();
    const [keys, recent] = await Promise.all([
      botApiKeysCollection<Document>(db)
        .find({ revokedAt: null })
        .project({ tokenHash: 0 })
        .sort({ lastUsedAt: -1, createdAt: -1 })
        .limit(200)
        .toArray(),
      botApiRequestLogCollection<Document>(db)
        .find({})
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray(),
    ]);
    return NextResponse.json({ keys, recent });
  } catch (error) {
    return handleRouteError(error);
  }
});
