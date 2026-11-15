import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { marketAtLeast, getMarketSystemMode } from "@/lib/market/featureFlag";
import { type MediaProductProject } from "@/lib/products/mediaProduct";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { mediaProductProjectsV1Collection } from "@/lib/db/repositories/mediaProductProjectsV1";

interface RouteParams {
  params: Promise<{ id: string; projectId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const limit = checkRateLimit(
      `api/corporations/[id]/media-products/[projectId]/retire:${auth.user.userId}`,
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
      {
        projection: {
          marketSystemMode: 1,
          mediaOperatingModelsEnabled: 1,
          mediaProductSlatesEnabled: 1,
          brandLoyaltyEnabled: 1,
          brandLoyaltySliceEnabled: 1,
          qualityPremiumPricingEnabled: 1,
        },
      }
    );
    if (
      config?.mediaProductSlatesEnabled !== true ||
      config.mediaOperatingModelsEnabled !== true ||
      config.brandLoyaltyEnabled !== true ||
      config.brandLoyaltySliceEnabled !== true ||
      config.qualityPremiumPricingEnabled !== true ||
      !marketAtLeast(await getMarketSystemMode(config), "clearing")
    ) {
      return errorResponse(409, "Media product slates are not enabled");
    }
    const result = await mediaProductProjectsV1Collection<MediaProductProject>(db).updateOne(
      {
        _id: projectId,
        corporationId: corporation._id.toString(),
        activeDevelopmentCorporationId: corporation._id.toString(),
        stage: "development",
      },
      { $set: { stage: "retired" }, $unset: { activeDevelopmentCorporationId: "" } }
    );
    if (result.matchedCount === 0) {
      return errorResponse(404, "Active media product project not found");
    }
    return NextResponse.json(
      { retired: true },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
