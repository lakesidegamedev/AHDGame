// Paginated, filterable activity log for moderator review.
// Auth: requireModerator
// Errors: 400, 403

import { requireModerator } from "@/lib/api/requireModerator";
import { handleRouteError } from "@/lib/api/errors";
import { getActivityLogResponse } from "@/lib/admin/activityLogRoute";

export async function GET(request: Request) {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    return await getActivityLogResponse(request);
  } catch (error) {
    return handleRouteError(error);
  }
}
