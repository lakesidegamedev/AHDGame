import { rejectWhileTurnProcessing } from "./turnGuard";
import { NextResponse } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { rejectDuringTurn } from "@/lib/api/rejectDuringTurn";
import { convertSectorIndustrySchema } from "@/lib/api/schemas/corporations";
import type { CorporateSector, GameState } from "@/lib/db/types";
import type { StateResourceCapacity } from "@/lib/db/types/stateResourceCapacity";
import { operatingSectorIdentity, type OperatingSectorType } from "@/lib/constants/corporations";
import { SECTOR_STRATEGIES, STRATEGY_COOLDOWN_TURNS } from "@/lib/constants/sectorStrategies";
import { isExtractionStrategyZeroYield } from "@/lib/corporations/extractionStrategyAvailability";
import { industryConversionFields } from "@/lib/corporations/retooling/conversion";
import { freeTransitionConversion } from "@/lib/market/producerMarket/transitionRules";

interface RouteParams {
  params: Promise<{ id: string; sectorId: string }>;
}

export type ConvertSectorOutcome =
  | { ok: true; sectorType: string; strategyId: string; capitalStock: number }
  | { ok: false; status: number; error: string };

/**
 * Convert a sector to another industry at book value: the funded-market
 * transition package's free conversion. Shared by the player route and AI
 * corporations; the caller has already checked who may act for the owner.
 * Refused during a turn (settlement freezes each plant's physical image).
 */
export async function convertSectorIndustryCore(
  db: Db,
  input: {
    corporationId: ObjectId;
    sectorId: ObjectId;
    targetLane: OperatingSectorType;
    strategyId?: string | null;
  }
): Promise<ConvertSectorOutcome> {
  const [sector, gameState] = await Promise.all([
    db
      .collection<CorporateSector>("corporateSectors")
      .findOne({ _id: input.sectorId, corporationId: input.corporationId }),
    db
      .collection<GameState>("gameState")
      .findOne(
        { _id: "current" },
        { projection: { currentTurn: 1, worldEpochId: 1, producerOpening: 1 } }
      ),
  ]);
  if (!sector) return { ok: false, status: 404, error: "Sector not found" };
  const currentTurn = gameState?.currentTurn ?? 0;
  const opening =
    gameState?.producerOpening && gameState.producerOpening.worldEpoch === gameState.worldEpochId
      ? gameState.producerOpening
      : null;
  if (!freeTransitionConversion(sector, currentTurn + 1, opening ? opening.turn + 1 : undefined))
    return {
      ok: false,
      status: 400,
      error:
        "Industry conversion is only open to over-built businesses during the market transition, once per business.",
    };
  if (sector.transitionFromStrategyId)
    return { ok: false, status: 400, error: "Finish the current retool before converting." };

  const result = industryConversionFields(sector, input.targetLane, input.strategyId);
  if (!result.ok) return { ok: false, status: 400, error: result.reason };
  const to = operatingSectorIdentity(input.targetLane);
  const strategyId = result.set.strategyId as string;

  const duplicate = await db.collection<CorporateSector>("corporateSectors").findOne(
    {
      _id: { $ne: sector._id },
      corporationId: input.corporationId,
      stateId: sector.stateId,
      sectorType: to.sectorType,
      industryModel: to.industryModel,
      mediaDiscriminator: to.mediaDiscriminator,
    },
    { projection: { _id: 1 } }
  );
  if (duplicate)
    return {
      ok: false,
      status: 400,
      error: "You already run that industry in this state. Expand that business instead.",
    };

  if (to.sectorType === "extraction") {
    const strategy = (SECTOR_STRATEGIES[input.targetLane] ?? []).find((s) => s.id === strategyId);
    const capacity = await db
      .collection<StateResourceCapacity>("stateResourceCapacity")
      .findOne({ stateId: sector.stateId }, { projection: { resources: 1 } });
    if (
      strategy &&
      isExtractionStrategyZeroYield(strategy, capacity ? (capacity.resources ?? null) : undefined)
    )
      return {
        ok: false,
        status: 400,
        error: "This state has no deposits for that extraction method.",
      };
  }

  const now = new Date();
  const write = await db.collection<CorporateSector>("corporateSectors").updateOne(
    {
      _id: sector._id,
      corporationId: input.corporationId,
      cutoverConvertedAtTurn: { $exists: false },
      transitionFromStrategyId: null,
    },
    {
      $set: {
        ...result.set,
        cutoverConvertedAtTurn: currentTurn,
        transitionCooldownUntilTurn: currentTurn + STRATEGY_COOLDOWN_TURNS,
        updatedAt: now,
      } as Partial<CorporateSector>,
      // Product caches belong to the old lane; the next turn rebuilds them.
      $unset: {
        transitionStartTurn: "",
        retoolRescaleApplied: "",
        outputUnitsByCommodity: "",
        outputAnchorByCommodity: "",
        productQualityByCommodity: "",
        productOutputCapacityUnits: "",
      },
    }
  );
  if (write.matchedCount === 0)
    return { ok: false, status: 409, error: "This business changed meanwhile. Try again." };
  return {
    ok: true,
    sectorType: input.targetLane,
    strategyId,
    capitalStock: result.set.capitalStock as number,
  };
}

/**
 * POST /api/corporations/[id]/sectors/[sectorId]/convert
 * Convert an over-built sector to another industry at book value, free, once,
 * during the market transition window. CEO only.
 */
export async function convertSectorIndustry(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const turnBusy = await rejectWhileTurnProcessing();
    if (turnBusy) return turnBusy;
    const rateLimit = checkRateLimit(
      `lib/corporations/commands/sectorOperations/convertSectorIndustry:${auth.user.userId}`,
      10,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { id, sectorId } = await params;
    const parsed = await parseJsonBody(request, convertSectorIndustrySchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    if (!ObjectId.isValid(sectorId)) return errorResponse(400, "Invalid sector ID");

    const db = await getDb();
    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;
    const ceoCheck = requireCeo(corporation, auth.user.userId);
    if (ceoCheck) return ceoCheck;

    const busy = await rejectDuringTurn(db);
    if (busy) return busy;

    const outcome = await convertSectorIndustryCore(db, {
      corporationId: corporation._id,
      sectorId: new ObjectId(sectorId),
      targetLane: parsed.data.targetLane,
      strategyId: parsed.data.strategyId,
    });
    if (!outcome.ok) return errorResponse(outcome.status, outcome.error);
    return NextResponse.json({ success: true, ...outcome });
  } catch (error) {
    return handleRouteError(error);
  }
}
