import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { findPartyBySequentialId, getStatePartyOrgDocumentId } from "@/lib/db/partyLookup";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { recordApiRequestTimingSafely } from "@/lib/observability/requestTimings";
import {
  PS_INVESTMENT_MAX_TIERS,
  psInvestmentRate,
} from "@/lib/turn/politicalStrength/strengthConstants";
import type { State, StatePartyOrg } from "@/lib/db/types";

interface RouteParams {
  params: Promise<{ code: string; id: string; partyId: string }>;
}

function maxStateBudget(countryId: CountryId): number {
  return psInvestmentRate(countryId, "state") * PS_INVESTMENT_MAX_TIERS;
}

function buildPsInvestmentSchema(countryId: CountryId) {
  const max = maxStateBudget(countryId);
  return z.object({
    budget: z
      .number()
      .min(0, "Budget must be non-negative")
      .max(
        max,
        `Budget cannot exceed ${max.toLocaleString()} (cap is +${PS_INVESTMENT_MAX_TIERS} PS/turn)`
      ),
  });
}

/**
 * POST /api/country/[code]/region/[id]/party/[partyId]/ps-investment —
 * set the state-party's per-turn USD budget for explicit Political
 * Strength investment.
 *
 * Half-priced relative to the national equivalent: $125k = +1 PS/turn,
 * cap $500k = +4 PS/turn (matches the existing convention that state
 * PS is twice as efficient per dollar). Self-throttling debit + hard-cap
 * headroom limit live in `partyActionGeneration.computePartyPsGain`.
 *
 * Auth: state chair / vice / treasurer / national chair / admin.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const startedAt = Date.now();
  const timings = {
    authMs: 0,
    validationMs: 0,
    stateReadMs: 0,
    partyReadMs: 0,
    orgReadMs: 0,
    updateMs: 0,
  };
  const finish = (response: Response) => {
    console.info("[ps-investment-timing]", {
      durationMs: Date.now() - startedAt,
      status: response.status,
      result: response.status < 400 ? "success" : response.status >= 500 ? "error" : "rejected",
      ...timings,
    });
    recordApiRequestTimingSafely({
      at: new Date(startedAt),
      route: "/api/country/[code]/region/[id]/party/[partyId]/ps-investment",
      durationMs: Date.now() - startedAt,
      status: response.status,
      result: response.status < 400 ? "success" : response.status >= 500 ? "error" : "rejected",
      stages: timings,
    });
    return response;
  };
  try {
    const { code, id: stateId, partyId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return finish(errorResponse(400, "Invalid country code"));
    }

    const authStartedAt = Date.now();
    const auth = await requireAuthWithCharacter();
    timings.authMs += Date.now() - authStartedAt;
    if (!auth.ok) return finish(auth.response);

    const rateLimitStartedAt = Date.now();
    const rateLimit = checkRateLimit(
      `api/country/[code]/region/[id]/party/[partyId]/ps-investment:${auth.user.userId}`,
      60,
      60000
    );
    timings.authMs += Date.now() - rateLimitStartedAt;
    if (!rateLimit.ok) return finish(rateLimitResponse(rateLimit.retryAfter));
    const authUser = auth.user;

    const validationStartedAt = Date.now();
    const parsed = await parseJsonBody(request, buildPsInvestmentSchema(countryId));
    timings.validationMs += Date.now() - validationStartedAt;
    if (!parsed.success) {
      return finish(errorResponse(parsed.status, parsed.error));
    }

    const db = await getDb();

    let stageStartedAt = Date.now();
    const state = await db.collection<State>("states").findOne({ _id: stateId, countryId });
    timings.stateReadMs += Date.now() - stageStartedAt;
    if (!state) {
      return finish(errorResponse(404, "State not found"));
    }

    stageStartedAt = Date.now();
    const party = await findPartyBySequentialId(db, partyId, countryId);
    timings.partyReadMs += Date.now() - stageStartedAt;
    if (!party) {
      return finish(errorResponse(404, "Party not found"));
    }

    const statePartyKey = getStatePartyOrgDocumentId(stateId, party);
    stageStartedAt = Date.now();
    const stateParty = await db
      .collection<StatePartyOrg>("statePartyOrg")
      .findOne({ _id: statePartyKey });
    timings.orgReadMs += Date.now() - stageStartedAt;
    if (!stateParty) {
      return finish(errorResponse(404, "Party has no presence in this state"));
    }

    const isAdmin = authUser.isAdmin;
    const isNationalChair = party.chairId?.equals(authUser.character._id);
    const isStateChair = stateParty.chairId?.equals(authUser.character._id);
    const isStateViceChair = stateParty.viceChairId?.equals(authUser.character._id);
    const isStateTreasurer = stateParty.treasurerId?.equals(authUser.character._id);

    if (!isAdmin && !isNationalChair && !isStateChair && !isStateViceChair && !isStateTreasurer) {
      return finish(
        errorResponse(
          403,
          "Only the state chair, vice chair, treasurer, national chair, or an admin can set the Political Strength budget"
        )
      );
    }

    const now = new Date();
    stageStartedAt = Date.now();
    await db
      .collection<StatePartyOrg>("statePartyOrg")
      .updateOne(
        { _id: statePartyKey },
        { $set: { psInvestmentBudget: parsed.data.budget, updatedAt: now } }
      );
    timings.updateMs += Date.now() - stageStartedAt;

    return finish(
      NextResponse.json({
        ok: true,
        psInvestmentBudget: parsed.data.budget,
        expectedPsPerTurn: Math.min(
          PS_INVESTMENT_MAX_TIERS,
          parsed.data.budget / psInvestmentRate(countryId, "state")
        ),
      })
    );
  } catch (error) {
    return finish(handleRouteError(error));
  }
}
