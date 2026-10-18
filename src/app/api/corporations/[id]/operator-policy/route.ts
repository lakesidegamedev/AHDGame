/**
 * GET    /api/corporations/[id]/operator-policy  — stored policy and effective permissions
 * PUT    /api/corporations/[id]/operator-policy  — replace the policy
 * DELETE /api/corporations/[id]/operator-policy  — clear it, back to role defaults
 *
 * The policy limits what an NPP operator (autopilot, caretaker, or an NPP CEO of a
 * subsidiary) may do. Auth: requireBasicAuth, then the corporation's CEO or owner,
 * or the controlling parent's CEO for a managed subsidiary. Errors: 401, 403, 400, 409.
 */

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation } from "@/lib/api/corporations/resolveQuery";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { canActOnCorporationAsParent } from "@/lib/corporations/subsidiaries/authorization";
import { buildOperatorPolicy, operatorPolicyInputSchema } from "@/lib/corporations/operatorPolicy";
import { operatorPermissionsFor } from "@/lib/turn/npp/operatorPermissions";
import type { Corporation } from "@/lib/db/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function authorize(
  db: Awaited<ReturnType<typeof getDb>>,
  corporation: Corporation,
  userId: string
) {
  const isCeo = corporation.ceoVacant !== true && corporation.userId?.toString() === userId;
  if (isCeo) return true;
  return canActOnCorporationAsParent(db, new ObjectId(userId), corporation);
}

function view(corporation: Corporation) {
  const permissions = operatorPermissionsFor(corporation);
  return {
    policy: corporation.operatorPolicy ?? null,
    effective: {
      role: permissions.role,
      actions: permissions.actions,
      sectorTypes: permissions.sectorTypes ? [...permissions.sectorTypes] : null,
      countryIds: permissions.countryIds ? [...permissions.countryIds] : null,
    },
  };
}

async function load(params: RouteParams["params"]) {
  const auth = await requireBasicAuth();
  if (!auth.ok) return { response: auth.response } as const;
  const rateLimit = checkRateLimit(auth.user.userId, 20, 60000);
  if (!rateLimit.ok) return { response: rateLimitResponse(rateLimit.retryAfter) } as const;
  const db = await getDb();
  const resolved = await resolveCorporation(db, (await params).id);
  if (!resolved.ok) return { response: resolved.response } as const;
  const { corporation } = resolved;
  if (corporation.countryOwnerId || corporation.isNationalized) {
    return {
      response: errorResponse(400, "State-owned corporations have no operator policy."),
    } as const;
  }
  if (!(await authorize(db, corporation, auth.user.userId))) {
    return {
      response: errorResponse(403, "Only the CEO or the parent corporation's CEO can do this"),
    } as const;
  }
  return { db, corporation } as const;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const loaded = await load(params);
    if ("response" in loaded) return loaded.response;
    return NextResponse.json(view(loaded.corporation));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const loaded = await load(params);
    if ("response" in loaded) return loaded.response;
    const { db, corporation } = loaded;
    const parsed = operatorPolicyInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(400, "Invalid operator policy.");
    const policy = buildOperatorPolicy(parsed.data, await getCurrentTurn(db));
    // Re-assert the operator seat so a CEO change between read and write cannot land the edit.
    const result = await db.collection<Corporation>("corporations").updateOne(
      {
        _id: corporation._id,
        userId: corporation.userId,
        ceoVacant: corporation.ceoVacant === true ? true : { $ne: true },
      },
      { $set: { operatorPolicy: policy, updatedAt: new Date() } }
    );
    if (result.modifiedCount !== 1) {
      return errorResponse(409, "The corporation changed. Refresh and try again.");
    }
    return NextResponse.json(view({ ...corporation, operatorPolicy: policy }));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const loaded = await load(params);
    if ("response" in loaded) return loaded.response;
    const { db, corporation } = loaded;
    await db
      .collection<Corporation>("corporations")
      .updateOne(
        { _id: corporation._id, userId: corporation.userId },
        { $unset: { operatorPolicy: "" }, $set: { updatedAt: new Date() } }
      );
    const { operatorPolicy: _removed, ...rest } = corporation;
    return NextResponse.json(view(rest as Corporation));
  } catch (error) {
    return handleRouteError(error);
  }
}
