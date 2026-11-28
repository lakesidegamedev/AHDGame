import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { withRecordedEconomicCommand } from "@/lib/api/withRecordedEconomicCommand";
import { getCurrentTurn } from "@/lib/currentTurn";
import { settleForcedDividend } from "@/lib/corporations/commands/forcedDividend";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse(400, "Invalid corporation ID");
    const db = await getDb();
    const requestId =
      request.headers.get("Idempotency-Key") ?? `legacy:${id}:${await getCurrentTurn(db)}`;
    if (!/^[a-zA-Z0-9:_-]{1,200}$/.test(requestId))
      return errorResponse(400, "Invalid request identity");
    return await withRecordedEconomicCommand(
      db,
      "admin-forced-dividend",
      id,
      requestId,
      { id },
      async (db) => NextResponse.json(await settleForcedDividend(db, new ObjectId(id), requestId))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
