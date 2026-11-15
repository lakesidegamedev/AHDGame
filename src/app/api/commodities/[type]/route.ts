import { conditionalJson } from "@/lib/api/conditionalJson";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import type { CommodityType } from "@/lib/constants/commodities";
import { getCommodityDetailData } from "@/lib/commodities/commodityDetail";

export { getCommodityDetailData };

interface RouteParams {
  params: Promise<{ type: string }>;
}

/**
 * GET /api/commodities/[type]
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { type } = await params;
    const commodity = type as CommodityType;

    if (!COMMODITY_TYPES.includes(commodity)) {
      return errorResponse(400, "Invalid commodity type");
    }

    const data = await getCommodityDetailData(commodity);
    // Per-user (country-access filtered) payload — private ETag/304 only, never
    // shared-cached. Cuts egress on unchanged polls without a cross-user key.
    return conditionalJson(request, data);
  } catch (error) {
    return handleRouteError(error);
  }
}
