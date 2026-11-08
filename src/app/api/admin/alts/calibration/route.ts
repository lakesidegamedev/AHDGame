// GET /api/admin/alts/calibration — how well the alt-detection confidence
// score is CALIBRATED against moderator dispositions on `altClusters`.
//
// Distinct from `/api/admin/alts/tuning`, which asks which SIGNALS
// discriminate. This asks whether a ring scored 80% is confirmed roughly 80%
// of the time: reliability bins, Brier and skill scores, calibration error,
// a precision/recall sweep, and per-signal precision.
//
// Auth: requireAdmin, matching the config it reasons about.
// ADVISORY ONLY and read-only; recommendations are applied via
// `PUT /api/admin/alts/config`.
//
// -> CalibrationReport (see src/lib/altDetection/calibration.ts for shape and
//   ground-truth caveats).
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError } from "@/lib/api/errors";
import { computeCalibrationReport } from "@/lib/altDetection/calibration";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const report = await computeCalibrationReport(db);
    return NextResponse.json(report);
  } catch (error) {
    return handleRouteError(error);
  }
}
