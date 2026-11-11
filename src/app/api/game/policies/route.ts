import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import type { Policy } from "@/lib/db/types";
import { policiesCollection } from "@/lib/db/repositories/policies";

// GET /api/game/policies — Returns all policy documents from the database.
// Auth: public
// Errors: (none)
export async function GET() {
  try {
    const db = await getDb();
    const policies = await policiesCollection(db).find({}).toArray();

    return NextResponse.json(policies, {
      headers: {
        // cache policy: reference — policy definitions seeded at deploy; long CDN cache OK
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400, no-transform",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
