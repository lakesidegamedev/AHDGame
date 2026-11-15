/**
 * POST /api/unions/[id]/leader/decline — decline a pending union presidency offer.
 */
import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { declineUnionLeadership } from "@/lib/unions/commands/declineUnionLeadership";
import { loadUnionLeaderOffer } from "../_shared";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await loadUnionLeaderOffer("decline", params);
    if (!ctx.ok) return ctx.response;

    const result = await declineUnionLeadership(ctx.db, ctx.character, ctx.union);
    if (!result.ok) {
      return errorResponse(result.status, result.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
