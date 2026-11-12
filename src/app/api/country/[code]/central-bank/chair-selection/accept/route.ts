import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/errors";
import {
  acceptCentralBankChairSelection,
  CHAIR_TERM_TURNS,
} from "@/lib/turn/centralBankChairSelection";
import { chairSelectionError, loadChairSelectionContext } from "../_shared";

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/country/[code]/central-bank/chair-selection/accept — Confirm pending CB chair appointment
// Auth: requireAuthWithCharacter
// Errors: 401, 403, 404, 429

export async function POST(_request: Request, context: RouteContext) {
  try {
    const ctx = await loadChairSelectionContext("accept", context.params);
    if (!ctx.ok) return ctx.response;

    const result = await acceptCentralBankChairSelection(
      ctx.db,
      ctx.countryId,
      ctx.character._id,
      new Date(),
      ctx.currentTurn
    );

    if (!result.ok) {
      return chairSelectionError(result.error ?? "Cannot accept");
    }

    return NextResponse.json({
      success: true,
      chairTermExpiresAtTurn: ctx.currentTurn + CHAIR_TERM_TURNS,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
