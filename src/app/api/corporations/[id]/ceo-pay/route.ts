/**
 * GET  /api/corporations/[id]/ceo-pay  the NPP CEO's pay, open demand and last decision
 * POST /api/corporations/[id]/ceo-pay  answer the open demand: accept, counter or replace
 *
 * Auth: requireBasicAuth, then the corporation's CEO or owner, or the
 * controlling parent's CEO for a managed subsidiary. Errors: 401, 403, 400, 409.
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
import { canActOnCorporationAsParent } from "@/lib/corporations/subsidiaries/authorization";
import {
  ceoPayResponseSchema,
  ceoPayView,
  respondToCeoPayDemand,
} from "@/lib/corporations/commands/ceoPay";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function load(params: RouteParams["params"]) {
  const auth = await requireBasicAuth();
  if (!auth.ok) return { response: auth.response } as const;
  const rateLimit = checkRateLimit(`api/corporations/[id]/ceo-pay:${auth.user.userId}`, 20, 60000);
  if (!rateLimit.ok) return { response: rateLimitResponse(rateLimit.retryAfter) } as const;
  const db = await getDb();
  const resolved = await resolveCorporation(db, (await params).id);
  if (!resolved.ok) return { response: resolved.response } as const;
  const { corporation } = resolved;
  const isOwner = corporation.userId?.toString() === auth.user.userId;
  if (
    !isOwner &&
    !(await canActOnCorporationAsParent(db, new ObjectId(auth.user.userId), corporation))
  ) {
    return {
      response: errorResponse(403, "Only the owner or the parent corporation's CEO can do this"),
    } as const;
  }
  return { db, corporation } as const;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const loaded = await load(params);
    if (loaded.response) return loaded.response;
    return NextResponse.json({ ceoPay: ceoPayView(loaded.corporation) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const loaded = await load(params);
    if (loaded.response) return loaded.response;
    const parsed = await parseJsonBody(request, ceoPayResponseSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const result = await respondToCeoPayDemand(
      loaded.db,
      loaded.corporation,
      parsed.data,
      await getCurrentTurn(loaded.db)
    );
    if (!result.ok) return errorResponse(result.status, result.error);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
