import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSingleplayer } from "@/lib/api/requireSingleplayer";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import {
  MAX_AUTOSAVE_INTERVAL,
  readSaveSettings,
  writeSaveSettings,
} from "@/lib/singleplayer/saves";
import { saveRouteError } from "@/lib/singleplayer/saveRoutes";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await readSaveSettings(), { headers: noStore });
  } catch (error) {
    return saveRouteError(error);
  }
}

const bodySchema = z.object({
  autosaveEvery: z.number().int().min(0).max(MAX_AUTOSAVE_INTERVAL),
});

/** Autosave after every Nth turn; 0 turns it off. Kept with the world, so it survives loading a save. */
export async function PUT(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    return NextResponse.json(await writeSaveSettings(parsed.data), { headers: noStore });
  } catch (error) {
    return saveRouteError(error);
  }
}
