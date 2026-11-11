import type { Db } from "mongodb";
import type { UserPayload } from "@/lib/auth";
import { unifiedSessionsCollection } from "@/lib/db/repositories/unifiedSessions";

type UnifiedSessionClaims = Pick<UserPayload, "userId" | "authSource" | "sid">;

function isUnifiedPayload(payload: UnifiedSessionClaims): boolean {
  return payload.authSource === "unified" && typeof payload.sid === "string";
}

export async function unifiedSessionIsCurrent(
  db: Db,
  payload: UnifiedSessionClaims
): Promise<boolean> {
  if (!isUnifiedPayload(payload)) return false;
  const session = await unifiedSessionsCollection<{
    _id: string;
    userId: string;
    revokedAt: Date | null;
    expiresAt: Date;
  }>(db).findOne({
    _id: payload.sid,
    userId: payload.userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  return session !== null;
}
