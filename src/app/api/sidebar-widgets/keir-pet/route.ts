import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { careForKeir } from "@/lib/sidebarWidgets/keirPet";

const bodySchema = z.object({ action: z.enum(["tea", "pat"]) });

// POST /api/sidebar-widgets/keir-pet: give the Keir pet tea or a pat
// Auth: requireBasicAuth; experimental features must be on
// Errors: 400, 401, 403, 409 (still on cooldown), 429
export async function POST(request: Request) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    if (auth.user.experimentalFeatures !== true) {
      return errorResponse(403, "Experimental features are off");
    }
    const limit = checkRateLimit(`keir-pet:${auth.user.userId}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);
    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const db = await getDb();
    const pet = await careForKeir(db, auth.user.userId, parsed.data.action);
    if (!pet) return errorResponse(409, "Keir is not ready for that yet");
    return NextResponse.json({ pet }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
