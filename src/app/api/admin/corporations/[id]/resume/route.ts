// POST /api/admin/corporations/[id]/resume
// Clears suspension — corporation re-enters turn processing next cycle.
// Auth: requireAdmin
// Errors: 403, 404

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, notFound } from "@/lib/api/errors";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const db = await getDb();
    const result = await corporationsCollection(db).updateOne(
      { _id: new ObjectId(id) },
      { $set: { suspended: false, suspendedUntilTurn: 0, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) throw notFound("Corporation not found");

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
