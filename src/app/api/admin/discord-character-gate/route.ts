import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { createAdminLog } from "@/lib/adminLog";
import type { GameConfig } from "@/lib/db/types";
const schema = z.object({ enabled: z.boolean() });
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const db = await getDb();
    const config = await db
      .collection<GameConfig>("gameConfig")
      .findOne({ _id: "default" }, { projection: { discordLinkRequiredForCharacter: 1 } });
    return NextResponse.json({ enabled: config?.discordLinkRequiredForCharacter === true });
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
        { $set: { discordLinkRequiredForCharacter: enabled } },
        { upsert: true }
      );
    await createAdminLog({
      category: "system",
      action: "discord_character_gate_changed",
      username: auth.admin.username,
      adminUsername: auth.admin.username,
      details: enabled
        ? "Discord linking required for new characters. Existing characters remain playable."
        : "Discord linking optional for new characters.",
    });
    return NextResponse.json({ success: true, enabled });
  } catch (error) {
    return handleRouteError(error);
  }
}
