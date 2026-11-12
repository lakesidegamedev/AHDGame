// GET/POST /api/country/[code]/legislature/cabinet-bills — list or propose cabinet bills
// Auth: GET public, POST requireAuthWithCharacter (PM or cabinet member)
// Error codes: 400, 401, 403, 409
import { NextResponse } from "next/server";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { handleRouteError, badRequest, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { COUNTRY_CONFIGS, getCountryConfig, type CountryId } from "@/lib/constants/countries";
import { checkLegislationFreeze } from "@/lib/api/parliamentaryFreeze";
import {
  listCabinetBills,
  proposeCabinetBill,
  proposeCabinetBillSchema,
} from "@/lib/cabinet/cabinetBills";

/**
 * GET — fetch current/recent cabinet bills for the Cabinet tab.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    return await listCabinetBills(countryId);
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST — propose a cabinet bill.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const config = getCountryConfig(countryId);
    if (!config.cabinetBillsEnabled) {
      return NextResponse.json(
        badRequest("Cabinet bills are not enabled for this country").toJson(),
        { status: 400 }
      );
    }

    const auth = await requireAuthWithCharacter();
    if (!auth.ok) return auth.response;
    const { character } = auth.user;

    // S#17 legislation freeze: block cabinet bill proposals while gov is pending.
    const freezeCheck = await checkLegislationFreeze(countryId);
    if (!freezeCheck.ok) return freezeCheck.response;

    const parsed = await parseJsonBody(request, proposeCabinetBillSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    return await proposeCabinetBill({
      countryId,
      character,
      isAdmin: Boolean(auth.user.isAdmin),
      input: parsed.data,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
