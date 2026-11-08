/**
 * POST /api/feedback/screenshot
 *
 * Accepts a multipart form upload with field "file" (PNG/JPEG image).
 * - On R2 (CLOUDFLARE_R2_ACCESS_KEY_ID set): uploads to Cloudflare R2 under feedback-screenshots/
 * - Locally: writes to /uploads/feedback-screenshots/<timestamp>.png
 *
 * Returns { url } of the stored screenshot.
 * Auth: requires a logged-in user (rate limiting inherited from feedback flow).
 */
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { storeScreenshotUpload } from "@/lib/feedback/screenshotUpload";

// POST /api/feedback/screenshot — Upload a screenshot image for a feedback submission.
// Auth: requireBasicAuth
// Errors: 400, 401, 429
export async function POST(request: Request) {
  const auth = await requireBasicAuth();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const rateLimit = checkRateLimit(`api/feedback/screenshot:${user.userId}`, 10, 60000);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

  return storeScreenshotUpload(request, user.userId, "feedback-screenshots");
}
