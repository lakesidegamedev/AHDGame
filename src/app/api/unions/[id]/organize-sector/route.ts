/**
 * POST /api/unions/[id]/organize-sector: targeted organizing drive / raid.
 * See `organizeSector` in
 * `@/lib/unions/commands/organizeSector` for the full contest rule.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { parseJsonBody, schemas } from "@/lib/api/validate";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import { organizeSector } from "@/lib/unions/commands/organizeSector";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const organizeSectorSchema = z.object({
  sectorId: schemas.objectId,
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `api/unions/[id]/organize-sector:${auth.user.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, organizeSectorSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const { id } = await params;
    const db = await getDb();
    const character = await getCharacterByUserId(db, auth.user.userId);
    if (!character) {
      return errorResponse(404, "Character not found");
    }

    const result = await organizeSector(db, character, id, parsed.data.sectorId);
    if (!result.ok) {
      return errorResponse(result.status, result.error);
    }
    const { ok: _ok, status: _status, ...payload } = result;
    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    return handleRouteError(error);
  }
}
