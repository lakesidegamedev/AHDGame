import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/validate";
import { experimentalFeaturesSchema } from "@/lib/api/schemas/settings";
import { applyExperimentalUiCookie } from "@/lib/api/experimentalUiCookie";
import { navCustomization } from "@/lib/navigation/navCustomization";
import type { User } from "@/lib/db/types";

// PATCH /api/settings/experimental-features: Opts the authenticated user in or out of
// experimental features, and saves desktop and mobile navigation and drawer presentation preferences
// Auth: requireBasicAuth
// Errors: 400, 401, 429
export async function PATCH(request: Request) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const rateLimit = checkRateLimit(
      `api/settings/experimental-features:${user.userId}`,
      30,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, experimentalFeaturesSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const {
      experimentalFeatures,
      askDrawerSide,
      askDrawerHidden,
      desktopNavigationLayout,
      mobileNavigationLayout,
      navCustomization: customization,
    } = parsed.data;

    const db = await getDb();
    await db.collection<User>("users").updateOne(
      { _id: new ObjectId(user.userId) },
      {
        $set: {
          ...(experimentalFeatures !== undefined ? { experimentalFeatures } : {}),
          ...(askDrawerSide !== undefined ? { askDrawerSide } : {}),
          ...(askDrawerHidden !== undefined ? { askDrawerHidden } : {}),
          ...(desktopNavigationLayout !== undefined ? { desktopNavigationLayout } : {}),
          ...(mobileNavigationLayout !== undefined ? { mobileNavigationLayout } : {}),
          ...(customization !== undefined
            ? { navCustomization: navCustomization(customization) }
            : {}),
          updatedAt: new Date(),
        },
      }
    );

    const response = NextResponse.json({ success: true });
    // The template reads the opt-in from a cookie, so apply a change to it on
    // this response rather than waiting for the next `/api/client-nav` load.
    if (experimentalFeatures !== undefined) {
      applyExperimentalUiCookie(response, experimentalFeatures);
    }
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
