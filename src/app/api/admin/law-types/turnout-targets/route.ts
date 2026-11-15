import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError } from "@/lib/api/errors";
import { getAllTurnoutTargetOptions } from "@/lib/demographics/turnoutTargets";

// GET /api/admin/law-types/turnout-targets: every country's demographic buckets
// for the law-type editor's targeting step.
// Auth: requireAdmin
// Errors: 403
//
// The union of every seeded country's census buckets, deduped by id: the
// editor is not scoped to one country. Served because the bucket set comes from
// the country electorate models, a server-only module graph that must not ship
// in a client bundle.
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    return NextResponse.json(
      { options: getAllTurnoutTargetOptions() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
