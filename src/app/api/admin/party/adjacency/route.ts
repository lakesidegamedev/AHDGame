import { partyAdjacencyEnabled } from "@/lib/parties/rules/adjacencyGate";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { createAdminLog } from "@/lib/adminLog";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
const schema = z.object({ enabled: z.boolean() }).strict();
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const db = await getDb();
    const config = await gameConfigCollection(db).findOne(
      { _id: "default" },
      { projection: { partyAdjacencyEnabled: 1 } }
    );
    return NextResponse.json({ enabled: partyAdjacencyEnabled(config) });
  } catch (error) {
    return handleRouteError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const parsed = await parseJsonBody(request, schema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const { enabled } = parsed.data;
    const db = await getDb();
    await gameConfigCollection(db).updateOne(
      { _id: "default" },
      { $set: { partyAdjacencyEnabled: enabled } },
      { upsert: true }
    );
    await createAdminLog({
      category: "system",
      action: "party_adjacency_gate_changed",
      username: auth.admin.username,
      adminUsername: auth.admin.username,
      details: enabled
        ? "Party adjacency requirements enabled."
        : "Party adjacency requirements disabled. Same-country joining, recruitment and relocation are unrestricted by party geography.",
    });
    return NextResponse.json({ success: true, enabled });
  } catch (error) {
    return handleRouteError(error);
  }
}
