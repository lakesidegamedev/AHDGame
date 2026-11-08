import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import type { CorporateSector } from "@/lib/db/types";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { setSectorSupplyPrioritySchema } from "@/lib/api/schemas/corporations";

interface RouteParams {
  params: Promise<{ id: string; sectorId: string }>;
}

/**
 * POST /api/corporations/[id]/sectors/[sectorId]/supply-priority
 * Opt a sector in or out of selling to outside buyers before the company's own
 * plants. Off removes the field, so the default is unchanged.
 * CEO only. Applies from the next turn.
 */
export async function setSectorSupplyPriority(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `lib/corporations/commands/sectorOperations/setSectorSupplyPriority:${auth.user.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { id, sectorId } = await params;
    const parsed = await parseJsonBody(request, setSectorSupplyPrioritySchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const { sellOutsideFirst } = parsed.data;

    const db = await getDb();
    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;

    const ceoCheck = requireCeo(corporation, auth.user.userId);
    if (ceoCheck) return ceoCheck;

    if (!ObjectId.isValid(sectorId)) return errorResponse(400, "Invalid sector ID");

    const sector = await db
      .collection<CorporateSector>("corporateSectors")
      .findOne({ _id: new ObjectId(sectorId), corporationId: corporation._id });
    if (!sector) return errorResponse(404, "Sector not found");

    await db
      .collection<CorporateSector>("corporateSectors")
      .updateOne(
        { _id: sector._id, corporationId: corporation._id },
        sellOutsideFirst
          ? { $set: { sellOutsideFirst: true, updatedAt: new Date() } }
          : { $unset: { sellOutsideFirst: "" }, $set: { updatedAt: new Date() } }
      );

    return NextResponse.json({ success: true, sellOutsideFirst });
  } catch (error) {
    return handleRouteError(error);
  }
}
