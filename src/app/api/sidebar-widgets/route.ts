import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { withNoStore } from "@/lib/api/withNoStore";
import { loadSidebarWidgetData } from "@/lib/sidebarWidgets/widgetData";
import { parseWidgetKey } from "@/lib/sidebarWidgets/widgetCatalog";

/** Tray widgets plus one per desktop menu, with headroom. */
const MAX_KEYS = 16;

// GET /api/sidebar-widgets?keys=myCompany,stockTicker:nyse
// Data for the experimental sidebar and menu widgets, one entry per key.
// Auth: requireBasicAuth; experimental features must be on
// Errors: 400, 401, 403, 429
export const GET = withNoStore(async (request: Request) => {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    if (auth.user.experimentalFeatures !== true) {
      return errorResponse(403, "Experimental features are off");
    }
    const limit = checkRateLimit(`sidebar-widgets:${auth.user.userId}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);

    const raw = new URL(request.url).searchParams.get("keys") ?? "";
    const keys = [...new Set(raw.split(",").filter(Boolean))];
    if (keys.length === 0 || keys.length > MAX_KEYS || !keys.every((key) => parseWidgetKey(key))) {
      return errorResponse(400, "Invalid widget keys");
    }

    const db = await getDb();
    const data = await loadSidebarWidgetData(db, keys, {
      userId: auth.user.userId,
      isAdmin: auth.user.isAdmin === true,
      isModerator: auth.user.isModerator === true,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
});
