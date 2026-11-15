import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { type ManufacturingProductProject } from "@/lib/products/manufacturingProject";
import { marketAtLeast, getMarketSystemMode } from "@/lib/market/featureFlag";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { manufacturingProductProjectsV2Collection } from "@/lib/db/repositories/manufacturingProductProjectsV2";

interface RouteParams {
  params: Promise<{ id: string; projectId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const limit = checkRateLimit(
      `api/corporations/[id]/products/[projectId]/retire:${auth.user.userId}`,
      20,
      60_000
    );
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);
    const { id, projectId } = await params;
    const db = await getDb();
    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const corporation = resolved.corporation;
    const ceoError = requireCeo(corporation, auth.user.userId);
    if (ceoError) return ceoError;
    const config = await gameConfigCollection(db).findOne(
      { _id: "default" },
      { projection: { marketSystemMode: 1, productLinesV2Enabled: 1 } }
    );
    if (
      config?.productLinesV2Enabled !== true ||
      !marketAtLeast(await getMarketSystemMode(config), "plants")
    ) {
      return errorResponse(409, "Manufacturing product lines are not enabled");
    }
    const result = await manufacturingProductProjectsV2Collection<ManufacturingProductProject>(
      db
    ).updateOne(
      {
        _id: projectId,
        corporationId: corporation._id.toString(),
        activeCorporationId: corporation._id.toString(),
      },
      {
        $set: { stage: "retired" },
        $unset: { activeCorporationId: "" },
      }
    );
    if (result.matchedCount === 0) {
      return errorResponse(404, "Active product project not found");
    }
    return NextResponse.json({ retired: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
