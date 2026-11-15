import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { getDb } from "@/lib/mongodb";
import { createAdminLog } from "@/lib/adminLog";
import { usersCollection } from "@/lib/db/repositories/users";
import { invalidateCachedUser } from "@/lib/auth/userDocCache";
import type { Document } from "mongodb";

const schema = z.object({ userId: z.string().length(24), whitelisted: z.boolean() });

/**
 * Grant or revoke VPN access for one account. A whitelisted account can play
 * normally while connected through a VPN. VPN use still counts toward alt
 * scoring either way.
 */
export const PATCH = withAdminRoute(async (auth, request: Request) => {
  const parsed = await parseJsonBody(request, schema);
  if (!parsed.success) return errorResponse(parsed.status, parsed.error);

  const { userId, whitelisted } = parsed.data;
  const db = await getDb();
  const _id = new ObjectId(userId);
  const user = await usersCollection<Document>(db).findOne(
    { _id },
    { projection: { username: 1 } }
  );
  if (!user) return errorResponse(404, "User not found");

  await usersCollection<Document>(db).updateOne(
    { _id },
    whitelisted
      ? {
          $set: {
            vpnWhitelisted: true,
            vpnWhitelistedAt: new Date(),
            vpnWhitelistedBy: auth.admin.username,
            updatedAt: new Date(),
          },
        }
      : {
          $unset: { vpnWhitelisted: "", vpnWhitelistedAt: "", vpnWhitelistedBy: "" },
          $set: { updatedAt: new Date() },
        }
  );
  invalidateCachedUser(userId);
  await createAdminLog({
    category: "account",
    action: whitelisted ? "vpn_whitelist_granted" : "vpn_whitelist_revoked",
    username: user.username,
    adminUsername: auth.admin.username,
  });
  return NextResponse.json({ success: true, whitelisted });
});
