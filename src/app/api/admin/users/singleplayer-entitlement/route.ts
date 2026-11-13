import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { getDb } from "@/lib/mongodb";
import { withAuditedGrant } from "@/lib/audit/grants/recordGrant";
import { createAdminLog } from "@/lib/adminLog";
import { usersCollection } from "@/lib/db/repositories/users";
import type { Document } from "mongodb";

const schema = z.object({ userId: z.string().length(24), entitled: z.boolean() });

/** Grant or revoke official desktop singleplayer access for one account. */
export const PATCH = withAdminRoute(async (auth, request: Request) => {
  const parsed = await parseJsonBody(request, schema);
  if (!parsed.success) return errorResponse(parsed.status, parsed.error);

  const { userId, entitled } = parsed.data;
  const db = await getDb();
  const _id = new ObjectId(userId);
  const user = await usersCollection<Document>(db).findOne(
    { _id },
    { projection: { username: 1 } }
  );
  if (!user) return errorResponse(404, "User not found");

  const apply = async () => {
    await usersCollection<Document>(db).updateOne(
      { _id },
      entitled
        ? {
            $set: {
              singleplayerEntitledAt: new Date(),
              singleplayerEntitledBy: auth.admin.username,
              updatedAt: new Date(),
            },
          }
        : {
            $unset: { singleplayerEntitledAt: "", singleplayerEntitledBy: "" },
            $set: { updatedAt: new Date() },
          }
    );
  };
  if (entitled) {
    await withAuditedGrant(
      db,
      {
        actorUserId: auth.admin.userId,
        recipients: [{ type: "user", id: userId, name: user.username }],
        kind: "access",
        item: "single-player access",
        reason: "Control panel: single-player access granted",
      },
      apply
    );
  } else {
    await apply();
  }
  await createAdminLog({
    category: "account",
    action: entitled ? "singleplayer_entitlement_granted" : "singleplayer_entitlement_revoked",
    username: user.username,
    adminUsername: auth.admin.username,
  });
  return NextResponse.json({ success: true, entitled });
});
