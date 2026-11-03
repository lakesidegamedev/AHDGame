import { governmentContractsEnabled } from "@/lib/governmentContracts/rules/featureGate";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { createAdminLog } from "@/lib/adminLog";
import type { GameConfig } from "@/lib/db/types";
const schema = z.object({ enabled: z.boolean() }).strict();
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const db = await getDb();
    const config = await db
      .collection<GameConfig>("gameConfig")
      .findOne({ _id: "default" }, { projection: { governmentContractsEnabled: 1 } });
    return NextResponse.json({ enabled: governmentContractsEnabled(config) });
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
    await db
      .collection<GameConfig>("gameConfig")
      .updateOne(
        { _id: "default" },
        { $set: { governmentContractsEnabled: enabled } },
        { upsert: true }
      );
    await createAdminLog({
      category: "system",
      action: "government_contracts_gate_changed",
      username: auth.admin.username,
      adminUsername: auth.admin.username,
      details: enabled
        ? "Government contracts enabled."
        : "Government contracts disabled for new tenders, bids and awards. Existing signed contracts continue.",
    });
    return NextResponse.json({ success: true, enabled });
  } catch (error) {
    return handleRouteError(error);
  }
}
