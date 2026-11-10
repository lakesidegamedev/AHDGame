import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeBattleAction } from "@/lib/api/battleAuthz";
import { parseJsonBody } from "@/lib/api/validate";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getConflictsCollection } from "@/lib/db/collections/conflicts";
import { getNavairBasingCollection } from "@/lib/db/collections/navairBasing";
import { FIGHTING_CONFLICT_STATUSES } from "@/lib/military/conflictLifecycle";
import { agreementId, agreementTransition } from "@/lib/navair/rules/supply";

const schema = z.object({
  host: z.string().refine((s) => Object.hasOwn(COUNTRY_CONFIGS, s), "Unknown host country."),
  guest: z.string().refine((s) => Object.hasOwn(COUNTRY_CONFIGS, s), "Unknown guest country."),
  domain: z.enum(["naval", "air"]),
  action: z.enum(["offer", "accept", "revoke"]),
});

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ code: string; positionId: string }>;
  }
) {
  try {
    const ctx = await authorizeBattleAction(params);
    if (ctx.error) return ctx.error;
    if (!ctx.isHolder && !ctx.isAdmin)
      return errorResponse(403, "Only the defense holder or admin may agree basing access.");
    const parsed = await parseJsonBody(request, schema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const { host, guest, domain, action } = parsed.data;
    const collection = getNavairBasingCollection(ctx.db);
    const current = await collection.findOne({ _id: agreementId(host, guest, domain) });
    const war = await getConflictsCollection(ctx.db).findOne(
      {
        status: { $in: [...FIGHTING_CONFLICT_STATUSES] },
        $or: [
          { "sideA.countries": host, "sideB.countries": guest },
          { "sideA.countries": guest, "sideB.countries": host },
        ],
      },
      { projection: { _id: 1 } }
    );
    let next;
    try {
      next = agreementTransition(
        current,
        ctx.countryId,
        host as CountryId,
        guest as CountryId,
        domain,
        action,
        ctx.currentTurn,
        war ? [host, guest] : []
      );
    } catch (error) {
      return errorResponse(
        400,
        error instanceof Error ? error.message : "Invalid basing agreement."
      );
    }
    if (current) {
      const result = await collection.replaceOne(
        { _id: current._id, status: current.status, updatedTurn: current.updatedTurn },
        next
      );
      if (!result.matchedCount)
        return errorResponse(409, "Basing access changed. Refresh and try again.");
    } else {
      await collection.insertOne(next);
    }
    return NextResponse.json({ ok: true, agreement: next });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return errorResponse(409, "Basing access changed. Refresh and try again.");
    }
    return handleRouteError(error);
  }
}
