import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireSingleplayer } from "@/lib/api/requireSingleplayer";
import { parseJsonBody } from "@/lib/api/validate";
import { withNoStore } from "@/lib/api/withNoStore";
import type { GameState } from "@/lib/db/types";
import { getDb } from "@/lib/mongodb";
import { loadSingleplayerGuide } from "@/lib/singleplayerGuideServer";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["dismiss", "inbox-opened"]),
});

/**
 * The first-game guide for the local world: which steps exist and which the
 * player has really done. `active: false` means the world never offered the
 * guide, or the player closed it.
 */
async function handleGET(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await loadSingleplayerGuide(await getDb()));
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);

/**
 * Record a guide event on the world. `dismiss` closes the guide for good (a
 * new world offers it again); `inbox-opened` stamps the one step that is a page
 * visit rather than game state. Both only write to a world that offers the
 * guide, so a stray call cannot add a guide to an older save.
 */
export async function POST(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const field =
      parsed.data.action === "dismiss"
        ? "singleplayerConfig.guide.dismissedAt"
        : "singleplayerConfig.guide.inboxOpenedAt";
    const db = await getDb();
    // Set once: a repeat visit must not move the original timestamp.
    await db.collection<GameState>("gameState").updateOne(
      {
        _id: "current",
        "singleplayerConfig.guide": { $exists: true },
        [field]: { $exists: false },
      },
      { $set: { [field]: new Date() } }
    );
    return NextResponse.json(await loadSingleplayerGuide(db));
  } catch (error) {
    return handleRouteError(error, { request, route: "/api/singleplayer/guide POST" });
  }
}
