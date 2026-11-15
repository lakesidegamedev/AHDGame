import { NextResponse } from "next/server";
import { z } from "zod";
import type { Filter } from "mongodb";
import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { getDb } from "@/lib/mongodb";
import { getGameState } from "@/lib/gameState";
import { createAdminLog } from "@/lib/adminLog";
import { getSettlementCrisesCollection } from "@/lib/db/collections";
import type { SettlementCrisisDoc } from "@/lib/db/types/settlementCrisis";
import { describeQualifyingWar, warFreezeNotice } from "@/lib/settlement/attachToWar";
import { openSettlementCrisis } from "@/lib/settlement/openCrisis";
import { closeSettlementCrisis } from "@/lib/settlement/closeCrisis";

/**
 * Admin control for the German Question. The turn phase only advances a crisis
 * that exists, so this route is the one way a question is asked or called off.
 *
 * Opening refuses when a crisis is already live, when a merge is still pending,
 * and when the two Germanies are no longer separate countries, all decided by
 * `openSettlementCrisis`.
 */
const bodySchema = z.object({ action: z.enum(["open", "close"]) });

/** GET /api/admin/settlement: whether a question is live, and any war caution. */
export const GET = withAdminRoute(async () => {
  const db = await getDb();
  const crises = await getSettlementCrisesCollection(db);
  const live = await crises.findOne({
    status: { $in: ["open", "frozen"] },
  } as Filter<SettlementCrisisDoc>);

  // Only worth a conflicts scan when the Open button is the one on screen.
  const openWarning = live ? null : await describeQualifyingWar(db).catch(() => null);

  return NextResponse.json({
    live: live
      ? { id: live._id.toString(), status: live.status, openedTurn: live.openedTurn }
      : null,
    openWarning: openWarning ? warFreezeNotice(openWarning, "before") : null,
  });
});

/** POST /api/admin/settlement: open or close the German Question. */
export const POST = withAdminRoute(async (auth, request: Request) => {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.success) return errorResponse(parsed.status, parsed.error);

  const db = await getDb();
  const gameState = await getGameState(db);
  const turn = gameState?.currentTurn ?? 1;
  const adminUsername = auth.admin.username;

  if (parsed.data.action === "open") {
    const result = await openSettlementCrisis(db, { turn });
    if (!result.opened) return errorResponse(409, result.reason ?? "The question did not open.");
    await createAdminLog({
      category: "system",
      action: "settlement_crisis_opened",
      username: adminUsername,
      adminUsername,
      details: `German Question opened on turn ${turn}.`,
    });
    return NextResponse.json({
      success: true,
      crisisId: result.crisisId,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  }

  const result = await closeSettlementCrisis(db, { turn });
  if (!result.closed) return errorResponse(409, result.reason ?? "The question did not close.");
  await createAdminLog({
    category: "system",
    action: "settlement_crisis_closed",
    username: adminUsername,
    adminUsername,
    details: `German Question called off on turn ${turn}.`,
  });
  return NextResponse.json({
    success: true,
    note: result.orphanedConflictId
      ? `Closed. Conflict ${result.orphanedConflictId} is still running on the Conflicts board and must be dealt with there.`
      : undefined,
  });
});
