/**
 * GET  /api/corporations/[id]/antitrust-case  the open Competition Act case and standing orders
 * POST /api/corporations/[id]/antitrust-case  the competition authority decides: order or dismiss
 *
 * Auth: requireBasicAuth. POST further requires the caller to hold the
 * country's competition authority seat. Errors: 401, 403, 400, 409.
 */
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { resolveCorporation } from "@/lib/api/corporations/resolveQuery";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { getGameState } from "@/lib/gameState";
import {
  antitrustCaseDecisionSchema,
  antitrustCaseView,
  antitrustOrdersView,
  decideAntitrustCase,
} from "@/lib/corporations/commands/antitrustCase";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const db = await getDb();
    const resolved = await resolveCorporation(db, (await params).id);
    if (!resolved.ok) return resolved.response;
    const gameState = await getGameState(db);
    const [view, orders, currentTurn] = await Promise.all([
      antitrustCaseView(
        db,
        resolved.corporation,
        new ObjectId(auth.user.userId),
        gameState?.currentYear ?? null
      ),
      antitrustOrdersView(db, resolved.corporation),
      getCurrentTurn(db),
    ]);
    return NextResponse.json({ antitrustCase: view, orders, currentTurn });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const rateLimit = checkRateLimit(
      `api/corporations/[id]/antitrust-case:${auth.user.userId}`,
      10,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);
    const db = await getDb();
    const resolved = await resolveCorporation(db, (await params).id);
    if (!resolved.ok) return resolved.response;
    const parsed = await parseJsonBody(request, antitrustCaseDecisionSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const gameState = await getGameState(db);
    const result = await decideAntitrustCase(
      db,
      resolved.corporation,
      new ObjectId(auth.user.userId),
      parsed.data.decision,
      await getCurrentTurn(db),
      gameState?.currentYear ?? null
    );
    if (!result.ok) return errorResponse(result.status, result.error);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
