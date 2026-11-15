import { withAdminRoute } from "@/lib/api/withAdminAuth";
// GET /api/admin/alts/tuning - advisory alt-scoring weight-tuning
// suggestions learned from moderator dispositions on `altClusters`
// (confirmed vs dismissed rings).
//
// Auth: requireAdmin only. Admin-depth tuning info that reasons about (and
// previews changes to) the scoring config, which is itself admin-only to edit
// (`PUT /api/admin/alts/config`) - unlike `GET /api/admin/alts/clusters`/`config`,
// which are readable by any moderator.
// Errors: 403
//
// GET /api/admin/alts/tuning -> TuningReport (see
//   src/lib/altDetection/tuning.ts for the full shape and the
//   discrimination-score method).
//
// ADVISORY ONLY. Read-only end to end: never writes to `gameConfig.altScoring`
// or `altClusters`. An admin reviews suggestions here and applies any of them
// (or not) through `PUT /api/admin/alts/config`.
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { computeTuningSuggestions } from "@/lib/altDetection/tuning";

export const GET = withAdminRoute(async (_auth) => {
  const db = await getDb();
  const report = await computeTuningSuggestions(db);
  return NextResponse.json(report);
});
