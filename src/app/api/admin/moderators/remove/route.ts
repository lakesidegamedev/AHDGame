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
import { planRevoke, staffRoleLabel } from "@/lib/staff/grantRules";
import { usersCollection } from "@/lib/db/repositories/users";

const removeSchema = z.object({
  userId: z.string().length(24),
  // Defaults to moderator so existing callers keep working.
  role: z.enum(GRANTABLE_STAFF_ROLES).default("moderator"),
});

// POST /api/admin/moderators/remove — Remove the moderator or junior dev role from a user.
// Auth: requireAdmin, and admins only.
// Errors: 400, 403, 404
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { admin } = auth;
    if (admin.isAdmin !== true) return errorResponse(403, "Forbidden");

    const parsed = await parseJsonBody(request, removeSchema);
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

    const plan = planRevoke(user, role);
    if (!plan.ok) {
      return errorResponse(plan.status, plan.error);
    }

    await usersCollection(db).updateOne(
      { _id: objectId },
      {
        $set: {
          role: "player",
          updatedAt: new Date(),
        },
        $unset: role === "moderator" ? { moderatorSince: "" } : { juniorDevSince: "" },
      }
    );

    const label = staffRoleLabel(role);
    await createAdminLog({
      category: "account",
      action: role === "moderator" ? "moderator_removed" : "junior_dev_removed",
      username: user.username,
      adminUsername: admin.username,
      details: `Removed ${label} role`,
    });

    return NextResponse.json({
      success: true,
      message: `${user.username} is no longer a ${label}`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
