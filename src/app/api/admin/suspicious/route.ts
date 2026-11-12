// Paginated list of suspicious characters, sorted by severity then flag count.
// Auth: requireAdmin
// Errors: 400, 403

import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError } from "@/lib/api/errors";
import { getSuspiciousListResponse } from "@/lib/admin/suspiciousListRoute";

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    return await getSuspiciousListResponse(request);
  } catch (error) {
    return handleRouteError(error);
  }
}
