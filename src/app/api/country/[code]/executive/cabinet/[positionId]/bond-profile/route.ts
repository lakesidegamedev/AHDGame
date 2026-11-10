// POST /api/country/[code]/executive/cabinet/[positionId]/bond-profile
// Auth: requireAuth — must be finance minister holder or admin
// Errors: 400, 401, 403, 404
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api/requireAuth";
import { requireConfirmedSecretary } from "@/lib/api/requireConfirmedSecretary";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getCabinetMembersCollection } from "@/lib/db/collections/cabinetMembers";
import { getGameState } from "@/lib/gameState";
import type { BondMaturityTurns } from "@/lib/db/types/bond";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import {
  SOVEREIGN_LONG_MATURITIES,
  presetUsesLongSovereignTenors,
  sovereignIssuanceMaturities,
} from "@/lib/bonds/rules/sovereignTenors";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";

// Shape check only: whether the world allows 10 and 30 year paper is checked
// against the game state below.
const bondProfileSchema = z.record(z.string(), z.number().min(0).max(1)).refine(
  (dist) => {
    const keys = Object.keys(dist).map(Number);
    if (keys.some((k) => !SOVEREIGN_LONG_MATURITIES.includes(k as BondMaturityTurns))) return false;
    const total = Object.values(dist).reduce((s, v) => s + v, 0);
    return Math.abs(total - 1) < 0.001;
  },
  {
    message:
      "distribution keys must be valid maturity turns (48/96/240, plus 480/1440 where long tenors are open) and values must sum to 1",
  }
);

interface RouteParams {
  params: Promise<{ code: string; positionId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const { code, positionId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    const config = COUNTRY_CONFIGS[countryId];
    if (!config) {
      return errorResponse(400, "Invalid country");
    }
    if (!config.financeMinisterCabinetId) {
      return errorResponse(400, "Bond profile is not configured for this country");
    }
    if (positionId !== config.financeMinisterCabinetId) {
      return errorResponse(403, "This position does not control sovereign bond profile");
    }

    const parsed = await parseJsonBody(request, bondProfileSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const db = await getDb();
    const myChar = auth.user.character;
    if (!myChar) {
      return errorResponse(403, "Character required");
    }

    const isAdmin = auth.user.isAdmin === true;
    if (!isAdmin) {
      const member = await getCabinetMembersCollection(db).findOne({
        countryId,
        positionId: config.financeMinisterCabinetId,
        characterId: new ObjectId(myChar._id),
      });
      if (!member) {
        return errorResponse(
          403,
          `Only the ${config.financeMinisterCabinetId} for ${countryId} can set the bond profile`
        );
      }
      // The maturity mix decides what the country owes and when, for up to 240
      // turns. The admin arm above never reaches here, which is the exemption.
      const actingDenied = requireConfirmedSecretary(member, "treasury");
      if (actingDenied) return actingDenied;
    }

    const gameState = await getGameState();
    const currentTurn = gameState?.currentTurn ?? 1;
    const allowed = sovereignIssuanceMaturities(presetUsesLongSovereignTenors(gameState?.preset));
    const disallowed = Object.entries(parsed.data).some(
      ([turns, share]) => share > 0 && !allowed.includes(Number(turns) as BondMaturityTurns)
    );
    if (disallowed) {
      return errorResponse(400, "10 and 30 year bonds are not available in this world");
    }
    const budgetId = getNationalBudgetId(countryId);
    const budget = await federalBudgetCollection(db).findOne({ _id: budgetId });
    if (!budget) {
      return errorResponse(404, "Federal budget not found");
    }

    // Rate limit: once per 24 turns (same as generic cabinet settings)
    const lastChangedTurn = budget.sovereignBondProfileLastChangedTurn ?? 0;
    if (!isAdmin && currentTurn - lastChangedTurn < 24) {
      const turnsRemaining = 24 - (currentTurn - lastChangedTurn);
      return errorResponse(
        400,
        `Bond profile can only be changed once per 24 turns. ${turnsRemaining} turns remaining.`
      );
    }

    // Convert string keys from JSON to BondMaturityTurns numbers.
    const distribution = Object.fromEntries(
      Object.entries(parsed.data)
        .filter(([k, v]) => v > 0 || allowed.includes(Number(k) as BondMaturityTurns))
        .map(([k, v]) => [Number(k) as BondMaturityTurns, v])
    ) as Partial<Record<48 | 96 | 240 | 480 | 1440, number>>;

    const now = new Date();
    await federalBudgetCollection(db).updateOne(
      { _id: budgetId },
      {
        $set: {
          sovereignBondProfile: distribution,
          sovereignBondProfileLastChangedTurn: currentTurn,
          updatedAt: now,
        },
      }
    );

    return NextResponse.json({
      success: true,
      sovereignBondProfile: distribution,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
