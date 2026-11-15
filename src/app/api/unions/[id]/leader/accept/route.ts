/**
 * POST /api/unions/[id]/leader/accept — accept a pending union presidency offer.
 */
import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { acceptUnionLeadership } from "@/lib/unions/commands/acceptUnionLeadership";
import { loadUnionLeaderOffer } from "../_shared";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await loadUnionLeaderOffer("accept", params);
    if (!ctx.ok) return ctx.response;

    const result = await acceptUnionLeadership(ctx.db, ctx.character, ctx.union);
    if (!result.ok) {
      return errorResponse(result.status, result.error);
    }

    return NextResponse.json({ success: true, unionId: result.unionId.toString() });
  } catch (error) {
    return handleRouteError(error);
  }
}
