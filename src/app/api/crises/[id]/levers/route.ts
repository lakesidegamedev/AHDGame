import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { proposeEmergencyBill } from "@/lib/crises/levers/emergencyBill";
import { pullLever } from "@/lib/crises/levers/leverCommand";
import { getDb } from "@/lib/mongodb";

const leverSchema = z.object({
  leverId: z.string().min(1).max(80),
  intensity: z.number().min(0).max(1).optional(),
  corporationId: z.string().optional(),
});

/**
 * POST /api/crises/[id]/levers
 * Pulls a role lever on a Crisis v2 crisis. A legislature lever raises an
 * emergency bill instead of acting directly.
 * Auth: requireAuthWithCharacter
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthWithCharacter();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!ObjectId.isValid(id)) return errorResponse(400, "Invalid crisis ID");
    const parsed = await parseJsonBody(request, leverSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const { leverId, intensity, corporationId } = parsed.data;
    if (corporationId !== undefined && !ObjectId.isValid(corporationId)) {
      return errorResponse(400, "Invalid corporation ID");
    }

    const db = await getDb();
    const input = {
      crisisId: new ObjectId(id),
      leverId,
      characterId: auth.user.character._id,
    };
    const pulled = await pullLever(db, {
      ...input,
      intensity,
      corporationId: corporationId ? new ObjectId(corporationId) : undefined,
    });
    if (pulled.ok) {
      return NextResponse.json({
        success: true,
        useId: pulled.useId.toString(),
        cost: pulled.cost,
        uncharged: pulled.uncharged,
      });
    }
    if (pulled.code === "needs_bill") {
      const bill = await proposeEmergencyBill(db, input);
      if (!bill.ok) return errorResponse(bill.status, bill.message);
      return NextResponse.json({ success: true, billId: bill.billId.toString() });
    }
    return errorResponse(pulled.status, pulled.message);
  } catch (error) {
    return handleRouteError(error);
  }
}
