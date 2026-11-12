/**
 * GET /api/world/conflicts/cold-war/dials
 *
 * The Cold War console's dials as the server holds them. The console's boards
 * keep theirs in localStorage; this is the reading they hydrate from on load, so
 * two players looking at the same war see the same readiness.
 *
 * Public, like the conflicts hub it serves.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api/errors";
import { getColdWarDials } from "@/lib/coldwar/dials";

export async function GET() {
  try {
    const db = await getDb();
    return NextResponse.json({ dials: await getColdWarDials(db) });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/world/conflicts/cold-war/dials" });
  }
}
