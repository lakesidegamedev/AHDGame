import { withAdminRoute } from "@/lib/api/withAdminAuth";
/**
 * GET /api/admin/country/[code]/readiness
 *
 * Admin diagnostic — returns a readiness report for the given country
 * without making any writes. Driven by COUNTRY_READINESS_EXPECTATIONS so
 * every supported country gets the same checks.
 *
 * Auth: requireAdmin
 * Errors: 400 (unknown country), 403, 404 (no expectations entry)
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { buildCountryReadinessReport } from "@/lib/admin/countryReadinessReport";

interface RouteParams {
  params: Promise<{ code: string }>;
}

export const GET = withAdminRoute(async (_auth, _req: Request, { params }: RouteParams) => {
  const { code } = await params;
  const countryId = code.toUpperCase() as CountryId;
  if (!COUNTRY_CONFIGS[countryId]) {
    return errorResponse(400, "Invalid country");
  }

  const db = await getDb();
  const report = await buildCountryReadinessReport(db, countryId);
  if (!report) {
    return errorResponse(404, `No readiness expectations registered for ${countryId}`);
  }

  return NextResponse.json(report);
});
