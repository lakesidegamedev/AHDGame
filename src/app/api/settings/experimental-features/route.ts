import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/validate";
import { experimentalFeaturesSchema } from "@/lib/api/schemas/settings";
import type { User } from "@/lib/db/types";

// PATCH /api/settings/experimental-features — Opts the authenticated user in or out of
// experimental features, and picks the side the Ask drawer docks to
// Auth: requireBasicAuth
// Errors: 400, 401, 429
export async function PATCH(request: Request) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const rateLimit = checkRateLimit(user.userId, 30, 60000);
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, experimentalFeaturesSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { experimentalFeatures, askDrawerSide } = parsed.data;

    const db = await getDb();
    await db.collection<User>("users").updateOne(
      { _id: new ObjectId(user.userId) },
      {
        $set: {
          ...(experimentalFeatures !== undefined ? { experimentalFeatures } : {}),
          ...(askDrawerSide !== undefined ? { askDrawerSide } : {}),
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
