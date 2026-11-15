import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/errors";
import { declineCentralBankChairSelection } from "@/lib/turn/centralBankChairSelection";
import { chairSelectionError, loadChairSelectionContext } from "../_shared";

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/country/[code]/central-bank/chair-selection/decline — Decline pending CB chair appointment
// Auth: requireAuthWithCharacter
// Errors: 400, 401, 403, 404, 429

export async function POST(_request: Request, context: RouteContext) {
  try {
    const ctx = await loadChairSelectionContext("decline", context.params);
    if (!ctx.ok) return ctx.response;

    const result = await declineCentralBankChairSelection(
      ctx.db,
      ctx.countryId,
      ctx.character._id,
      new Date(),
      ctx.currentTurn
    );

    if (!result.ok) {
      return chairSelectionError(result.error ?? "Cannot decline");
    }

    return NextResponse.json({
      success: true,
      vacancy: result.vacancy === true,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
