// Paginated, filterable activity log for admin review.
// Auth: requireAdmin
// Errors: 400, 403

import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { handleRouteError } from "@/lib/api/errors";
import { getActivityLogResponse } from "@/lib/admin/activityLogRoute";

export const GET = withAdminAuth(async (_auth, request: Request) => {
  try {
    return await getActivityLogResponse(request);
  } catch (error) {
    return handleRouteError(error);
  }
});
