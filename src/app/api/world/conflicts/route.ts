/**
 * GET /api/world/conflicts
 *
 * Every live conflict, as the minimum a picker needs: the theater key, the public
 * number, the name, and each side's label. Public, like the conflicts hub it
 * mirrors.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api/errors";
import { listActiveConflicts } from "@/lib/db/collections/conflicts";
import type { ConflictOption } from "@/lib/military/dto/conflictOption";

export async function GET() {
  try {
    const db = await getDb();
    const docs = await listActiveConflicts(db);
    const conflicts: ConflictOption[] = docs.map((d) => ({
      id: d._id,
      conflictId: d.conflictId,
      name: d.name,
      sideALabel: d.sideA.label,
      sideBLabel: d.sideB.label,
      declaredByBillId: d.declaredByBillId,
    }));

    return NextResponse.json({ conflicts });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/world/conflicts" });
  }
}
