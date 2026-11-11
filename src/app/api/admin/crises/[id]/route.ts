/**
 * Single crisis operations.
 * PATCH  /api/admin/crises/[id] — resolve early (body: { action: "resolve" })
 * DELETE /api/admin/crises/[id] — hard delete
 * Auth: requireAdmin
 * Errors: 400 invalid ID/body, 403, 404 not found
 */
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, notFound, errorResponse } from "@/lib/api/errors";
import { logWireEvent } from "@/lib/wireEvent";
import type { Crisis } from "@/lib/db/types/crisis";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import type { Document } from "mongodb";
import { crisesCollection } from "@/lib/db/repositories/crises";

const PatchSchema = z.object({
  action: z.literal("resolve"),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse(400, "Invalid ID");

    const parsed = await parseJsonBody(request, PatchSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const db = await getDb();
    const crisis = await crisesCollection(db).findOne({ _id: new ObjectId(id) });
    if (!crisis) throw notFound("Crisis not found");

    const gameState = await gameStateCollection<Document>(db).findOne({
      _id: "current" as unknown as ObjectId,
    });
    const currentTurn: number = (gameState as { currentTurn?: number } | null)?.currentTurn ?? 0;

    await crisesCollection(db).updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "resolved", endTurn: currentTurn, resolvedAt: new Date() } }
    );

    if (crisis.wireMessageOnEnd) {
      await logWireEvent("crisis_end", crisis.wireMessageOnEnd, {
        href: `/world/crises/${id}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse(400, "Invalid ID");

    const db = await getDb();
    const result = await crisesCollection<Document>(db).deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) throw notFound("Crisis not found");

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
