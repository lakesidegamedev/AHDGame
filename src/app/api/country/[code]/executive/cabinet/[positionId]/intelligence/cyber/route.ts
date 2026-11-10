// POST /api/country/[code]/executive/cabinet/[positionId]/intelligence/cyber
//
// Launch a cyber operation against another country, or publicly stand down against it.
// Success depends on this country's cyber capability against the target's resilience;
// attribution is a separate roll. Standing down opens a truce that refuses further
// operations between the pair.
//
// Auth: the intelligence seat holder or an admin. Errors: 400, 401, 403, 404, 409
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { launchCyberOperation, standDownCyber } from "@/lib/cyber/runCyberOperation";
import {
  getOrCreateAgency,
  loadCurrentTurn,
  requireIntelligenceHolder,
  requireRegisteredTarget,
  type IntelligenceRouteParams,
} from "../shared";

const bodySchema = z.object({
  targetCountryId: z.string().min(2).max(4),
  action: z.enum(["launch", "stand_down"]),
});

export async function POST(request: Request, { params }: IntelligenceRouteParams) {
  try {
    const { code, positionId } = await params;
    const guard = await requireIntelligenceHolder(code, positionId);
    if ("error" in guard) return guard.error;
    const { db, countryId, member, user } = guard;

    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const target = await requireRegisteredTarget(db, parsed.data.targetCountryId, countryId);
    if ("error" in target) return target.error;
    const { targetCountryId } = target;

    const turn = await loadCurrentTurn(db);
    const agency = await getOrCreateAgency(db, countryId, turn, member?.characterId ?? null);

    if (parsed.data.action === "stand_down") {
      const result = await standDownCyber(
        db,
        countryId,
        targetCountryId,
        turn,
        user.userId ?? null
      );
      if (!result.ok) return errorResponse(result.status, result.error);
      return NextResponse.json({ truceUntilTurn: result.truceUntilTurn });
    }

    const result = await launchCyberOperation({
      db,
      attackerId: countryId,
      targetId: targetCountryId,
      turn,
      tradecraft: agency.tradecraft,
      actorUserId: user.userId ?? null,
      chargeAppropriation: true,
    });
    if (!result.ok) return errorResponse(result.status, result.error);
    return NextResponse.json({
      outcome: result.outcome,
      attributed: result.attributed,
      message: result.message,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
