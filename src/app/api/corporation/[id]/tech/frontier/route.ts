/**
 * POST /api/corporation/[id]/tech/frontier: the CEO buys one frontier programme.
 *
 * Gated by the `sectorTechTreesEnabled` feature flag. CEO only. Opens once the
 * corporation owns the last tier's baseline in its committed track; spends
 * rdScore at a price that rises with every programme bought. The rules and
 * the guarded spend live in the shared command (lib/corporations/commands/techTree).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { isSectorTechTreesEnabled } from "@/lib/corporations/techTree/featureFlag";
import { buyFrontierProgramme } from "@/lib/corporations/commands/techTree/buyFrontierProgramme";
import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import type { GameState } from "@/lib/db/types";

const frontierSchema = z.object({
  kind: z.enum(["output", "input"]),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `api/corporation/[id]/tech/frontier:${auth.user.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { id } = await params;
    const parsed = await parseJsonBody(request, frontierSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const db = await getDb();
    const gameState = await db.collection<GameState>("gameState").findOne({ _id: "current" });
    if (!(await isSectorTechTreesEnabled(gameState ?? undefined))) {
      return errorResponse(404, "Tech trees are not enabled");
    }

    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;

    const ceoCheck = requireCeo(corporation, auth.user.userId);
    if (ceoCheck) return ceoCheck;

    const currentTurn = gameState?.currentTurn ?? 1;
    const startingYear = gameState?.startingYear ?? STARTING_YEAR;
    const currentYear =
      gameState?.currentYear ?? startingYear + Math.floor((currentTurn - 1) / TURNS_PER_YEAR);

    const result = await buyFrontierProgramme(db, corporation, parsed.data.kind, currentYear);
    if (!result.ok) {
      return errorResponse(result.status, result.error);
    }

    return NextResponse.json({
      success: true,
      kind: result.kind,
      rdCost: result.rdCost,
      purchases: result.purchases,
      rdScoreRemaining: result.rdScoreRemaining,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
