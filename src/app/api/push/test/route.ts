import { errorResponse } from "@/lib/api/errors";
import { suppressTracing } from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { assertSameOrigin } from "@/lib/api/assertSameOrigin";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/validate";
import { withNoStore } from "@/lib/api/withNoStore";
import { installationHash, pushDevices } from "@/lib/nativePush/devices";
import { sendNativePush } from "@/lib/nativePush/providers";

const body = z.object({ installation: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

/**
 * Send one test alert to this phone, straight away, so a player can see that
 * alerts reach them. Only the installation that registered under the signed-in
 * account can ask, and it leaves the inbox and the delivery cursor alone.
 */
export const POST = withNoStore(async (request: Request) => {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const auth = await requireBasicAuth();
  if (!auth.ok) return auth.response;
  const limit = checkRateLimit(`native-push-test:${auth.user.userId}`, 3, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfter);
  const parsed = await parseJsonBody(request, body, { maxBytes: 1024 });
  if (!parsed.success) return errorResponse(400, "Invalid installation");
  try {
    return await suppressTracing(async () => {
      const devices = await pushDevices(await getDb());
      const device = await devices.findOne({
        _id: installationHash(parsed.data.installation),
        userId: new ObjectId(auth.user.userId),
        expiresAt: { $gt: new Date() },
      });
      if (!device) return NextResponse.json({ result: "not_registered" });
      const result = await sendNativePush(device, {
        title: "Test alert",
        subtitle: "System",
        body: "Alerts are reaching this device. Tap to open your inbox.",
        path: "/notifications",
        href: "/notifications",
        thread: "system",
        count: 1,
        id: `test-${Date.now()}`,
      });
      return NextResponse.json({ result });
    });
  } catch {
    return errorResponse(503, "Could not send a test alert");
  }
});
