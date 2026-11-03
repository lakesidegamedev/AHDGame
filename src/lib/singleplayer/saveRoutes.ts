import type { NextResponse } from "next/server";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { SaveError } from "@/lib/singleplayer/saves";

/** Save errors carry a status and a sentence meant for the player; anything else is a fault. */
export function saveRouteError(error: unknown): NextResponse {
  if (error instanceof SaveError) return errorResponse(error.status, error.message);
  return handleRouteError(error);
}
