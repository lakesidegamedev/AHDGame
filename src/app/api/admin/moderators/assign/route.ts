import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { parseJsonBody } from "@/lib/api/validate";
import { createAdminLog } from "@/lib/adminLog";
import { z } from "zod";
import type { User } from "@/lib/db/types";
import { GRANTABLE_STAFF_ROLES } from "@/lib/staff/rules";
import { planGrant, staffRoleLabel } from "@/lib/staff/grantRules";
import { usersCollection } from "@/lib/db/repositories/users";

const assignSchema = z.object({
  userId: z.string().length(24),
  // Defaults to moderator so existing callers keep working.
  role: z.enum(GRANTABLE_STAFF_ROLES).default("moderator"),
});

// POST /api/admin/moderators/assign — Grant the moderator or junior dev role to a user.
// Auth: requireAdmin, and admins only: junior devs and moderators cannot call it.
// Errors: 400, 403, 404
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { admin } = auth;
    // A junior dev passes requireAdmin on reads only, but granting roles is
    // an admin-only act by definition, so check the principal explicitly.
    if (admin.isAdmin !== true) return errorResponse(403, "Forbidden");

    const parsed = await parseJsonBody(request, assignSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { role } = parsed.data;

    const db = await getDb();
    const objectId = new ObjectId(parsed.data.userId);
    const user = await usersCollection(db).findOne({ _id: objectId });

    if (!user) {
      return errorResponse(404, "User not found");
    }

    const plan = planGrant(user, role);
    if (!plan.ok) {
      return errorResponse(plan.status, plan.error);
    }

    const now = new Date();
    await usersCollection(db).updateOne(
      { _id: objectId },
      {
        $set: {
          role,
          ...(role === "moderator" ? { moderatorSince: now } : { juniorDevSince: now }),
          updatedAt: now,
        },
      }
    );

    const label = staffRoleLabel(role);
    await createAdminLog({
      category: "account",
      action: role === "moderator" ? "moderator_assigned" : "junior_dev_assigned",
      username: user.username,
      adminUsername: admin.username,
      details: `Assigned ${label} role`,
    });

    return NextResponse.json({
      success: true,
      message: `${user.username} is now a ${label}`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
