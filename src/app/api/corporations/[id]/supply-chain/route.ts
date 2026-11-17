import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { withNoStore } from "@/lib/api/withNoStore";
import { resolveCorporation } from "@/lib/api/corporations/resolveQuery";
import { isSittingCeoOfControllingParent } from "@/lib/corporations/reservedCorporateHoldings";
import { loadCompanySupplyChain } from "@/lib/corporations/supplyChain/query";

// Auth: signed-in corporate insider or authorized staff.
export const GET = withNoStore(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const viewer = await getAuthUser();
      if (!viewer) return errorResponse(401, "Sign in to view company supply chains.");
      const db = await getDb();
      const resolved = await resolveCorporation(db, (await params).id);
      if (!resolved.ok) return resolved.response;
      const company = resolved.corporation;
      const staff =
        viewer.isAdmin === true ||
        (viewer.isModerator === true && new URL(request.url).searchParams.get("modView") === "1");
      const owner = !!viewer.userId && company.userId?.toString() === viewer.userId;
      if (
        !staff &&
        !owner &&
        !(await isSittingCeoOfControllingParent(db, company, viewer.userId))
      ) {
        return errorResponse(
          403,
          "Supply-chain details are available to company management and authorized staff."
        );
      }
      return NextResponse.json(await loadCompanySupplyChain(db, company._id.toString()));
    } catch (error) {
      return handleRouteError(error);
    }
  }
);
