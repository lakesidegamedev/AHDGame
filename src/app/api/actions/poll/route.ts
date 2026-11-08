import { withNoStore } from "@/lib/api/withNoStore";
import { NextRequest } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireBasicAuth, requireHumanSession } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/validate";
import { pollCommissionSchema } from "@/lib/api/schemas/poll";
import { buildPollOverview, commissionPoll } from "@/lib/actions/pollCommission";

// GET /api/actions/poll — Returns poll eligibility, stored poll results, and demographic context for the authenticated character's home state
// Auth: requireBasicAuth
// Errors: 400, 401, 404
async function handleGET(request: NextRequest) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const pollType = request.nextUrl.searchParams.get("type") === "large" ? "large" : "small";
    return await buildPollOverview({ userId: auth.user.userId, pollType });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);

// POST /api/actions/poll — Commissions a quick or full demographic poll, deducts funds and actions, and persists the results
// Auth: requireHumanSession (bot tokens rejected)
// Errors: 400, 401, 403, 404, 429
export async function POST(request: NextRequest) {
  try {
    const auth = await requireHumanSession(request);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const rateLimit = checkRateLimit(`api/actions/poll:${user.userId}`, 30, 60000);
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, pollCommissionSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    return await commissionPoll({ userId: user.userId, pollType: parsed.data.type });
  } catch (error) {
    return handleRouteError(error);
  }
}
