import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/errors";
import type { NppMarketEntryFunnel } from "@/lib/db/types";
import { getDb } from "@/lib/mongodb";
import {
  NPP_MARKET_ENTRY_FUNNEL_COLLECTION,
  normalizeNppMarketEntryFunnel,
} from "@/lib/turn/npp/entryFunnelSnapshot";

const querySchema = z.object({
  turn: z.coerce.number().int().nonnegative().optional(),
});

// GET /api/admin/economy/npp-entry-funnel - Return the persisted NPP market
// entry funnel: one primary rejection reason per candidate plus the
// state-sector cells each rejected candidate targeted. Reads the turn
// snapshot written by the NPP phase, so it reports evidence without
// recomputing any entry formula. Defaults to the current turn.
// Auth: requireAdmin
// Errors: 400, 403, 404
export const GET = withAdminRoute(async (_auth, request: Request) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return errorResponse(400, "Invalid query", { extra: { details: parsed.error.flatten() } });
  }

  const db = await getDb();
  const doc =
    parsed.data.turn == null
      ? await db
          .collection<NppMarketEntryFunnel>(NPP_MARKET_ENTRY_FUNNEL_COLLECTION)
          .findOne({ _id: "current" })
      : await db
          .collection<NppMarketEntryFunnel>(NPP_MARKET_ENTRY_FUNNEL_COLLECTION)
          .findOne({ _id: `turn:${parsed.data.turn}` });

  const funnel = normalizeNppMarketEntryFunnel(doc);
  if (!funnel) {
    return errorResponse(404, "NPP entry funnel snapshot not found");
  }
  return NextResponse.json({ funnel });
});
