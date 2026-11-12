/**
 * POST /api/suggestions/screenshot — multipart image for player suggestion compose flow.
 * Blob path: player-suggestion-screenshots/
 */
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { storeScreenshotUpload } from "@/lib/feedback/screenshotUpload";

// POST /api/suggestions/screenshot — Upload screenshot for forum suggestion submission.
// Auth: requireBasicAuth
// Errors: 400, 401, 429
export async function POST(request: Request) {
  const auth = await requireBasicAuth();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const rateLimit = checkRateLimit(`api/suggestions/screenshot:${user.userId}`, 10, 60000);
  if (!rateLimit.ok)
    return rateLimitResponse(
      rateLimit.retryAfter,
      "Too many screenshot uploads in a short time. Please wait a minute and try again."
    );

  return storeScreenshotUpload(request, user.userId, "player-suggestion-screenshots");
}
