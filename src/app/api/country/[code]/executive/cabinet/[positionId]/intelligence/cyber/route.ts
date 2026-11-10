// POST /api/country/[code]/executive/cabinet/[positionId]/intelligence/cyber
//
// Launch a cyber operation against another country, or publicly stand down against it.
// Success depends on this country's cyber capability against the target's resilience;
// attribution is a separate roll. Standing down opens a truce that refuses further
// operations between the pair.
//
// GET returns the console view: every target with its odds and whether an operation is
// allowed now, the active truces, and recent operations by and against this country.
//
// Auth: the intelligence seat holder or an admin. Errors: 400, 401, 403, 404, 409
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getAllCountryAccess } from "@/lib/countryAccess";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { getIntelligenceOpLogCollection } from "@/lib/db/collections/intelligence";
import { operationCost } from "@/lib/intelligence/cost";
import { cyberOdds, cyberOperationRefusal } from "@/lib/cyber/operations";
import { loadCyberResilience } from "@/lib/cyber/resilience";
import {
  CYBER_OPERATION_TYPE,
  CYBER_STAND_DOWN_TYPE,
  foldCyberPairHistory,
  launchCyberOperation,
  standDownCyber,
} from "@/lib/cyber/runCyberOperation";
import {
  getOrCreateAgency,
  loadCurrentTurn,
  requireIntelligenceHolder,
  requireRegisteredTarget,
  type IntelligenceRouteParams,
} from "../shared";

const RECENT_LIMIT = 20;

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

export async function GET(_request: Request, { params }: IntelligenceRouteParams) {
  try {
    const { code, positionId } = await params;
    const guard = await requireIntelligenceHolder(code, positionId);
    if ("error" in guard) return guard.error;
    const { db, countryId, member } = guard;

    const turn = await loadCurrentTurn(db);
    const agency = await getOrCreateAgency(db, countryId, turn, member?.characterId ?? null);

    const access = await getAllCountryAccess(db);
    const targetIds = (Object.keys(COUNTRY_CONFIGS) as CountryId[])
      .filter((id) => id !== countryId && access[id]?.registered)
      .sort();

    const log = await getIntelligenceOpLogCollection(db);
    const [resilience, budget, rows] = await Promise.all([
      loadCyberResilience(db, [countryId, ...targetIds]),
      (await getFederalBudgetCollection(db)).findOne(
        { countryId },
        { projection: { gdp: 1, intelligenceAppropriation: 1 } }
      ),
      log
        .find({
          domain: "cyber",
          $or: [{ ownerCountryId: countryId }, { targetCountryId: countryId }],
        })
        .sort({ turn: -1 })
        .toArray(),
    ]);

    const own = resilience.find((r) => r.countryId === countryId)?.resilience ?? 0.4;
    const resilienceOf = new Map(resilience.map((r) => [r.countryId, r.resilience]));
    const cost = Math.round(operationCost("action", budget?.gdp ?? 0));

    const targets = targetIds.map((targetId) => {
      const pairRows = rows.filter(
        (r) => r.ownerCountryId === targetId || r.targetCountryId === targetId
      );
      const targetResilience = resilienceOf.get(targetId) ?? null;
      const refusal = cyberOperationRefusal(
        countryId,
        targetId,
        foldCyberPairHistory(pairRows, countryId),
        targetResilience,
        turn
      );
      return {
        countryId: targetId,
        refusal,
        odds:
          targetResilience === null || refusal === "no_resilience_data"
            ? null
            : cyberOdds(own, agency.tradecraft, targetResilience),
      };
    });

    const truces = new Map<string, { countryId: string; untilTurn: number; byYou: boolean }>();
    for (const row of rows) {
      if (row.opType !== CYBER_STAND_DOWN_TYPE || row.truceUntilTurn == null) continue;
      if (row.truceUntilTurn <= turn) continue;
      const other = row.ownerCountryId === countryId ? row.targetCountryId : row.ownerCountryId;
      const existing = truces.get(other);
      if (!existing || existing.untilTurn < row.truceUntilTurn) {
        truces.set(other, {
          countryId: other,
          untilTurn: row.truceUntilTurn,
          byYou: row.ownerCountryId === countryId,
        });
      }
    }

    // An operation against this country names its sponsor only when it was attributed.
    const operations = rows
      .filter((r) => r.opType === CYBER_OPERATION_TYPE)
      .slice(0, RECENT_LIMIT)
      .map((r) => {
        const byYou = r.ownerCountryId === countryId;
        return {
          direction: byYou ? ("by_you" as const) : ("against_you" as const),
          countryId: byYou
            ? r.targetCountryId
            : r.compromise === "attributed"
              ? r.ownerCountryId
              : null,
          succeeded: r.outcome === "success",
          attributed: r.compromise === "attributed",
          turn: r.turn,
        };
      });

    return NextResponse.json({
      turn,
      cost,
      balance: budget?.intelligenceAppropriation?.balance ?? 0,
      hasDirector: agency.directorCharacterId != null,
      targets,
      truces: [...truces.values()],
      operations,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
