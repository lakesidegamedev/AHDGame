import { rejectDuringTurn } from "@/lib/api/rejectDuringTurn";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { foundCorporationSchema } from "@/lib/api/schemas/corporations";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import type { Character, CorporateSector, State, User } from "@/lib/db/types";
import {
  INACTIVE_CEO_TURN_THRESHOLD,
  isInactiveCeoPenaltyCandidate,
} from "@/lib/turn/corporation/inactiveCeoSectorShed";
import {
  OPERATING_SECTOR_TYPE_LABELS,
  CEO_INITIAL_SHARES,
  DEFAULT_SHARE_PRICE,
} from "@/lib/constants/corporations";
import { shouldRedactCorporation, redactPrivateCorporation } from "@/lib/corporations/redaction";
import { parentCeoVisibleCorporationIds } from "@/lib/corporations/parentCeoVisibility";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getAuthUser } from "@/lib/auth";
import { getEnabledCountryIds } from "@/lib/countryAccess";
import { foundCorporation } from "@/lib/corporations/commands/founding/foundCorporation";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

const INACTIVE_CEO_THRESHOLD_MS = INACTIVE_CEO_TURN_THRESHOLD * 60 * 60 * 1000;

/**
 * GET /api/corporations?stateId=CA&search=Acme
 * List all corporations with CEO info. Optionally filter by state (HQ or sector presence)
 * and/or by name substring (case-insensitive).
 */
export async function GET(request: Request) {
  try {
    const authUser = await getAuthUser();
    const isAdmin = authUser?.isAdmin === true;
    const enabledCountries = isAdmin ? undefined : await getEnabledCountryIds();

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const stateId = searchParams.get("stateId");
    const search = searchParams.get("search") ?? "";

    // If filtering by state, find corps with sectors in that state or HQ'd there
    const corpFilter: Record<string, unknown> = {};

    if (enabledCountries !== undefined) {
      corpFilter.countryId = { $in: enabledCountries };
    }

    if (stateId) {
      const sectorsInState = await db
        .collection<CorporateSector>("corporateSectors")
        .find({ stateId: stateId.toUpperCase() })
        .project<{ corporationId: ObjectId }>({ corporationId: 1 })
        .toArray();
      const corpIdsFromSectors = sectorsInState.map((s) => s.corporationId);

      corpFilter.$or = [
        { headquartersState: stateId.toUpperCase() },
        { _id: { $in: corpIdsFromSectors } },
      ];
    }

    // Apply case-insensitive name filter when provided (escaped — user input must not be a regex)
    if (search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      corpFilter.name = { $regex: escaped, $options: "i" };
    }

    const corporations = await corporationsCollection(db)
      .find(corpFilter)
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    // Fetch CEO characters for display
    const ceoIds = corporations.map((c) => c.ceoId).filter((id): id is ObjectId => id != null);
    const characters = await db
      .collection<Character>("characters")
      .find({ _id: { $in: ceoIds } })
      .project<{ _id: ObjectId; name: string; avatarUrl?: string; sequentialId?: number }>({
        _id: 1,
        name: 1,
        avatarUrl: 1,
        sequentialId: 1,
      })
      .toArray();
    const ceoMap = new Map(characters.map((c) => [c._id.toString(), c]));

    // Fetch CEO-owning users to derive ceoIsInactive.
    // Eligibility is the turn step's own predicate, so the UI never flags
    // state-owned, nationalized, autopilot or NPP-run corps as inactive when
    // the turn step will not shed them.
    const ceoUserIds = corporations
      .filter(isInactiveCeoPenaltyCandidate)
      .map((c) => c.userId as ObjectId);
    const ceoUsers =
      ceoUserIds.length > 0
        ? await db
            .collection<User>("users")
            .find({ _id: { $in: ceoUserIds } })
            .project<{ _id: ObjectId; lastActivity?: Date; createdAt?: Date }>({
              _id: 1,
              lastActivity: 1,
              createdAt: 1,
            })
            .toArray()
        : [];
    const ceoUserMap = new Map(ceoUsers.map((u) => [u._id.toString(), u]));
    const inactiveCutoffMs = Date.now() - INACTIVE_CEO_THRESHOLD_MS;

    // Compute per-corp income from sectors (need all sectors of matched corps for total income)
    const corpIds = corporations.map((c) => c._id);
    const allSectors =
      corpIds.length > 0
        ? await db
            .collection<CorporateSector>("corporateSectors")
            .find({ corporationId: { $in: corpIds } })
            .toArray()
        : [];

    const incomeByCorpId = new Map<string, number>();
    for (const sector of allSectors) {
      const corpKey = sector.corporationId.toString();
      const maintenance = sector.revenue * (1 - sector.profitMargin / 100);
      const sectorProfit = sector.revenue - maintenance - sector.currentGrowthCost;
      incomeByCorpId.set(corpKey, (incomeByCorpId.get(corpKey) ?? 0) + sectorProfit);
    }

    // Resolve state names
    const hqStateIds = [...new Set(corporations.map((c) => c.headquartersState))];
    const hqStates =
      hqStateIds.length > 0
        ? await db
            .collection<State>("states")
            .find({ _id: { $in: hqStateIds } })
            .project<{ _id: string; name: string }>({ _id: 1, name: 1 })
            .toArray()
        : [];
    const stateNameMap = new Map(hqStates.map((s) => [s._id, s.name]));

    const viewerUserId = authUser?.userId;
    const viewerIsAdmin = authUser?.isAdmin === true;

    const parentVisibleIds = await parentCeoVisibleCorporationIds(
      db,
      corporations.filter((corp) => shouldRedactCorporation(corp, viewerUserId, viewerIsAdmin)),
      viewerUserId
    );
    const result = corporations.map((corp) => {
      const ceo = corp.ceoId && !corp.ceoVacant ? ceoMap.get(corp.ceoId.toString()) : undefined;
      const sectorIncome = incomeByCorpId.get(corp._id.toString()) ?? 0;
      const income = sectorIncome - corp.marketingBudget - (corp.ceoSalary ?? 0);

      let ceoIsInactive = false;
      if (isInactiveCeoPenaltyCandidate(corp) && corp.userId != null) {
        const u = ceoUserMap.get(corp.userId.toString());
        const reference = u?.lastActivity ?? u?.createdAt;
        if (reference && reference.getTime() < inactiveCutoffMs) {
          ceoIsInactive = true;
        }
      }

      const fullRow = {
        _id: corp._id,
        sequentialId: corp.sequentialId,
        name: corp.name,
        description: corp.description,
        type: corp.type,
        industryModel: corp.industryModel ?? null,
        typeLabel:
          corp.type === "manufacturing" && corp.industryModel === "vehicles"
            ? "Vehicle manufacturing"
            : OPERATING_SECTOR_TYPE_LABELS[corp.type],
        headquartersState: corp.headquartersState,
        headquartersStateName: stateNameMap.get(corp.headquartersState) ?? corp.headquartersState,
        liquidCapital: corp.liquidCapital,
        // Every money field on this row (liquidCapital, sharePrice, income)
        // renders in the corp's home currency — UI passes this to formatAmount
        // so wallet preference still drives final display.
        liquidCurrencyCode: corp.liquidCurrencyCode ?? null,
        logoUrl: corp.logoUrl,
        sharePrice: corp.sharePrice ?? DEFAULT_SHARE_PRICE,
        totalShares: corp.totalShares ?? CEO_INITIAL_SHARES,
        income: Math.round(income),
        isPrivate: corp.isPrivate ?? false,
        ceo: ceo
          ? { name: ceo.name, avatarUrl: ceo.avatarUrl, sequentialId: ceo.sequentialId }
          : null,
        ceoIsInactive,
      };
      if (
        shouldRedactCorporation(corp, viewerUserId, viewerIsAdmin) &&
        !parentVisibleIds.has(corp._id.toString())
      ) {
        const redacted = redactPrivateCorporation(fullRow as Record<string, unknown>);
        return { ...redacted, isPrivate: true };
      }
      return fullRow;
    });

    return NextResponse.json(
      { corporations: result },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleRouteError(error, { request, route: "/api/corporations" });
  }
}

/**
 * POST /api/corporations
 * Found a new corporation. Costs 1M from character funds.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(`api/corporations:${auth.user.userId}`, 10, 60000);
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, foundCorporationSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const db = await getDb();
    const turnGuard = await rejectDuringTurn(db);
    if (turnGuard) return turnGuard;
    // Founding is intentionally exempt from BOTH pause signals:
    // - `isActive === false` (turns paused for registration / settling): players
    //   must still be able to found during that window.
    // - `corporationActionsPaused`: that flag only freezes existing CEOs'
    //   dividend/share/IPO/sector mutations via `requireCorporationActionsEnabled`
    //   on `src/app/api/corporations/[id]/**` (and expand).

    // Get character
    const character = auth.user.character;
    if (!character) {
      return errorResponse(404, "Character not found");
    }

    const result = await foundCorporation({
      db,
      userId: auth.user.userId,
      character,
      request: parsed.data,
    });
    if (!result.ok) {
      return errorResponse(result.status, result.error, { extra: result.extra });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return handleRouteError(error, { request, route: "/api/corporations POST" });
  }
}
