import { NextResponse } from "next/server";
import { requireSingleplayer } from "@/lib/api/requireSingleplayer";
import { errorResponse } from "@/lib/api/errors";
import { deleteSave, isSaveId } from "@/lib/singleplayer/saves";
import { saveRouteError } from "@/lib/singleplayer/saveRoutes";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!isSaveId(id)) return errorResponse(400, "Not a save id.");
    if (!(await deleteSave(id))) return errorResponse(404, "That save no longer exists.");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return saveRouteError(error);
  }
}
