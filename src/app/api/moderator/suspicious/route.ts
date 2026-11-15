// Paginated list of suspicious characters for moderator review.
// Auth: requireModerator
// Errors: 400, 403

import { requireModerator } from "@/lib/api/requireModerator";
import { handleRouteError } from "@/lib/api/errors";
import { getSuspiciousListResponse } from "@/lib/admin/suspiciousListRoute";

export async function GET(request: Request) {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    return await getSuspiciousListResponse(request);
  } catch (error) {
    return handleRouteError(error);
  }
}
