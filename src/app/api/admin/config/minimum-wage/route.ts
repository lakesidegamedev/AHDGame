import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { createAdminLog } from "@/lib/adminLog";
import { clampKaitzRatio, MIN_WAGE_KAITZ_MAX } from "@/lib/labour/laborCost";
import type { FederalBudget } from "@/lib/db/types";

const patchSchema = z.object({
  countryId: z.string().min(1).max(8),
  // Kaitz ratio (minimum wage ÷ median wage), 0 = no floor. null clears the
  // override, so with minimumWageLawStage on the country follows its law.
  kaitzRatio: z.number().min(0).max(MIN_WAGE_KAITZ_MAX).nullable(),
});

// GET /api/admin/config/minimum-wage — per-country minimum-wage Kaitz ratios
// Auth: requireAdmin
// Errors: 403
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const budgets = await db
      .collection<FederalBudget>("federalBudget")
      .find({}, { projection: { countryId: 1, minimumWageKaitzRatio: 1 } })
      .toArray();

    const ratios: Record<string, number> = {};
    // Countries with an admin ratio set, which overrides their national law.
    const overridden: string[] = [];
    for (const b of budgets) {
      if (!b.countryId) continue;
      ratios[b.countryId] = b.minimumWageKaitzRatio ?? 0;
      if (typeof b.minimumWageKaitzRatio === "number") overridden.push(b.countryId);
    }
    return NextResponse.json({ ratios, overridden });
  } catch (error) {
    return handleRouteError(error);
  }
}

// PATCH /api/admin/config/minimum-wage — set or clear a country's minimum-wage Kaitz ratio
// Auth: requireAdmin
// Errors: 400, 403, 404
//
// Floors low-pay sectors' labor cost in the corporation turn (only when
// labourSystemMode ≥ "wages"; inert otherwise). See
// docs/plans/2026-06-30-labour-system.md (Phase 3). With minimumWageLawStage
// on, a set ratio overrides the national minimum wage law (any value, 0
// included) and a cleared one hands the country back to the law.
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(request, patchSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const { countryId } = parsed.data;
    const kaitzRatio =
      parsed.data.kaitzRatio === null ? null : clampKaitzRatio(parsed.data.kaitzRatio);

    const db = await getDb();
    const result = await db
      .collection<FederalBudget>("federalBudget")
      .updateOne(
        { countryId },
        kaitzRatio === null
          ? { $unset: { minimumWageKaitzRatio: "" } }
          : { $set: { minimumWageKaitzRatio: kaitzRatio } }
      );

    if (result.matchedCount === 0) {
      return errorResponse(404, `No federal budget found for country "${countryId}".`);
    }

    await createAdminLog({
      category: "system",
      action: "minimum_wage_set",
      username: auth.admin.username,
      adminUsername: auth.admin.username,
      details:
        kaitzRatio === null
          ? `Minimum wage override for ${countryId} cleared (follows the national minimum wage law).`
          : kaitzRatio > 0
            ? `Minimum wage for ${countryId} set to Kaitz ratio ${kaitzRatio.toFixed(2)} (min wage = ${Math.round(kaitzRatio * 100)}% of median wage).`
            : `Minimum wage for ${countryId} removed (no floor).`,
    });

    return NextResponse.json({ success: true, countryId, kaitzRatio });
  } catch (error) {
    return handleRouteError(error);
  }
}
