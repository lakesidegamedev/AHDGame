import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSingleplayer } from "@/lib/api/requireSingleplayer";
import { parseJsonBody } from "@/lib/api/validate";
import { errorResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import {
  createManualSave,
  listSaves,
  readSaveSettings,
  readSaveState,
  MAX_SAVE_NAME_LENGTH,
} from "@/lib/singleplayer/saves";
import { saveRouteError } from "@/lib/singleplayer/saveRoutes";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const noStore = { "Cache-Control": "no-store" };

/** Saves for this world, newest first, with the autosave setting and the last load result. */
export async function GET(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    const [saves, settings, state] = await Promise.all([
      listSaves(),
      readSaveSettings(),
      readSaveState(),
    ]);
    return NextResponse.json(
      {
        saves,
        settings,
        autosaveError: state.lastAutosaveError?.message ?? null,
        lastLoad: state.lastRestore ?? null,
      },
      { headers: noStore }
    );
  } catch (error) {
    return saveRouteError(error);
  }
}

const bodySchema = z.object({
  name: z
    .string()
    .max(MAX_SAVE_NAME_LENGTH * 2)
    .optional(),
});

/** Save the world now under a name. Long-running on a big world: it copies the whole database. */
export async function POST(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const save = await createManualSave(await getDb(), parsed.data.name);
    return NextResponse.json({ save }, { headers: noStore });
  } catch (error) {
    return saveRouteError(error);
  }
}
