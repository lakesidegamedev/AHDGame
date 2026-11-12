import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/errors";
import type { EconomicVitalSigns } from "@/lib/db/types";
import { evaluateCorporateNoHolderAlert } from "@/lib/economy/corporateNoHolderAlert/rules";
import { getDb } from "@/lib/mongodb";
import { economicVitalSignsCollection } from "@/lib/db/repositories/economicVitalSigns";

// Keep this read-only route off the full turn-snapshot import graph.

const querySchema = z.object({
  turn: z.coerce.number().int().nonnegative().optional(),
});

// GET /api/admin/economy/vital-signs - Return the latest or requested aggregate economic snapshot.
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
  const snapshot =
    parsed.data.turn == null
      ? await economicVitalSignsCollection<EconomicVitalSigns>(db).findOne(
          {},
          { sort: { turn: -1 } }
        )
      : await economicVitalSignsCollection<EconomicVitalSigns>(db).findOne({
          turn: parsed.data.turn,
        });

  if (!snapshot) {
    return errorResponse(404, "Economic vital signs snapshot not found");
  }
  return NextResponse.json({
    snapshot,
    alerts: { corporateNoHolder: evaluateCorporateNoHolderAlert(snapshot) },
  });
});
