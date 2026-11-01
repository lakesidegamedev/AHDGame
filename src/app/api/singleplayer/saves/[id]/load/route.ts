import { NextResponse } from "next/server";
import { requireSingleplayer } from "@/lib/api/requireSingleplayer";
import { errorResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { isSaveId, requestLoad } from "@/lib/singleplayer/saves";
import { saveRouteError } from "@/lib/singleplayer/saveRoutes";

export const dynamic = "force-dynamic";

/**
 * Queue a save to be loaded. Nothing in the running world changes: the client
 * restarts the world, and the start applies the load before the player is let
 * in (see applyPendingRestore). Refused mid-turn, because stopping the world
 * there would cut the turn short.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!isSaveId(id)) return errorResponse(400, "Not a save id.");
    const state = await (
      await getDb()
    )
      .collection<{ _id: string; isProcessing?: boolean }>("gameState")
      .findOne({ _id: "current" }, { projection: { isProcessing: 1 } });
    if (state?.isProcessing === true)
      return errorResponse(409, "A turn is running. Load a save when it finishes.");
    const save = await requestLoad(id);
    return NextResponse.json(
      { ok: true, restartRequired: true, save },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return saveRouteError(error);
  }
}
