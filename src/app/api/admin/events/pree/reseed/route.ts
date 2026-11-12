import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError } from "@/lib/api/errors";
import { seedPreeEventDefinitions } from "@/lib/events/pree/seedDefinitions";
import { eventDefinitionsCollection } from "@/lib/db/repositories/eventDefinitions";
import type { Document } from "mongodb";

export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const { upserted } = await seedPreeEventDefinitions(db);

    const result = await eventDefinitionsCollection<Document>(db).updateMany(
      { status: { $ne: "retired" } },
      { $set: { status: "approved" } }
    );

    return NextResponse.json({
      success: true,
      upserted,
      approved: result.modifiedCount,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
