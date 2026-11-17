import { loadWorkforceSkillByState } from "@/lib/politicalLegislation/workforceSkillLoader";
import { sectorEconomicRevenue } from "@/lib/corporations/sectorRevenueBasis";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireBotToken } from "@/lib/api/requireBotToken";
import { checkRateLimit, rateLimitResponse, BOT_FINANCIAL_LIMITS } from "@/lib/api/rateLimit";
import {
  OPERATING_SECTOR_TYPE_LABELS,
  calculateWorkers,
  isOperatingSectorType,
  OPERATING_SECTOR_TYPES,
} from "@/lib/constants/corporations";

import {
  fxRateForCorpFromMap,
  fxRateForSectorHostFromMap,
  resolveSectorHostCurrencyCode,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
  type CorpCapitalCurrencyInfo,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { statesCollection } from "@/lib/db/repositories/states";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

const PAGE_SIZE = 10;

// GET /api/discord-bot/sectors — Returns paginated corporate sector data for a given type; unowned=true is retired and returns an empty list.
// Auth: requireAdminOrApiKey
// Errors: 400, 401
export async function GET(request: Request) {
  try {
    if (!requireBotToken(request)) {
      return errorResponse(401, "Unauthorized");
    }

    const rateLimit = checkRateLimit(
      "discord-bot:sectors",
      BOT_FINANCIAL_LIMITS.maxRequests,
      BOT_FINANCIAL_LIMITS.windowMs
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const url = new URL(request.url);
    const requestedType = url.searchParams.get("type");
    const unowned = url.searchParams.get("unowned") === "true";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));

    if (!isOperatingSectorType(requestedType)) {
      return errorResponse(
        400,
        `Must provide a valid type. Options: ${OPERATING_SECTOR_TYPES.join(", ")}`
      );
    }
    const sectorType = requestedType;
    const laneFilter = { sectorType: sectorType };

    const db = await getDb();

    if (unowned) {
      // The unowned list is retired: markets are entered by building. The request
      // stays valid for the bot and answers with an empty list.
      return NextResponse.json({
        found: false,
        mode: "unowned",
        deprecated: "unowned=true is retired: markets are entered by building. Use the owned list.",
        sectorType,
        sectorLabel: OPERATING_SECTOR_TYPE_LABELS[sectorType],
        page: 1,
        totalPages: 1,
        totalItems: 0,
        sectors: [],
      });
    }

    // Owned mode: list all corporate sectors of this type, sorted by revenue in ₳.
    // Can't use db-level .sort({ revenue: -1 }) — sector.revenue is per-corp local
    // (v0.2.6), so comparing raw magnitudes mixes currencies. Fetch all, resolve
    // FX per corp, sort by anchor revenue, paginate in memory.
    const allSectors = await corporateSectorsCollection(db).find(laneFilter).toArray();

    const totalItems = allSectors.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const clampedPage = Math.min(page, totalPages);

    if (allSectors.length === 0) {
      return NextResponse.json({
        found: false,
        mode: "owned",
        sectorType,
        sectorLabel: OPERATING_SECTOR_TYPE_LABELS[sectorType],
        page: 1,
        totalPages: 1,
        totalItems: 0,
        sectors: [],
      });
    }

    // Resolve corporation (with currency info) and state names
    const corpIds = [...new Set(allSectors.map((s) => s.corporationId))];
    const stateIds = [...new Set(allSectors.map((s) => s.stateId))];

    const [corporations, states, workforceSkillMap, fxByCurrency] = await Promise.all([
      corporationsCollection(db)
        .find({ _id: { $in: corpIds } })
        .project<
          {
            _id: ObjectId;
            name: string;
            brandColor?: string;
            sequentialId?: number;
          } & CorpCapitalCurrencyInfo
        >({
          _id: 1,
          name: 1,
          brandColor: 1,
          sequentialId: 1,
          countryId: 1,
          liquidCurrencyCode: 1,
        })
        .toArray(),
      statesCollection(db)
        .find({ _id: { $in: stateIds } })
        .project<{ _id: string; name: string }>({ _id: 1, name: 1 })
        .toArray(),
      // SP4: merged legacy + political-board read so playable regions' worker
      // counts keep matching the turn's adapter-fed values.
      loadWorkforceSkillByState(db, stateIds),
      loadFxRatesByCurrency(db),
    ]);

    const corpMap = new Map(corporations.map((c) => [c._id.toString(), c]));
    const stateMap = new Map(states.map((s) => [s._id, s.name]));

    const fxByCorpId = new Map<string, { code: CurrencyCode | undefined; rate: number }>();
    for (const c of corporations) {
      fxByCorpId.set(c._id.toString(), {
        code: resolveCorpLiquidCurrencyCode(c),
        rate: fxRateForCorpFromMap(c, fxByCurrency),
      });
    }

    // Rank every sector by revenueAnchor (₳-comparable), then paginate. The
    // anchor uses the SECTOR's host currency, which is what `revenue` is stored
    // in; converting at the owner's rate misranks foreign sectors.
    // `liquidCurrencyCode` stays the OWNER's currency: it labels the corp.
    // Note: `resolveCorpEconomicAnchor` is not used here, the anchor is computed
    // per sector.
    const rankedSectors = allSectors
      .map((s) => {
        const corp = corpMap.get(s.corporationId.toString());
        const fx = fxByCorpId.get(s.corporationId.toString());
        return {
          sector: s,
          revenueAnchor: readCorpEconomicAnchor(
            sectorEconomicRevenue(s),
            resolveSectorHostCurrencyCode(s, corp),
            fxRateForSectorHostFromMap(s, corp, fxByCurrency)
          ),
          liquidCurrencyCode: fx?.code ?? null,
        };
      })
      .sort((a, b) => b.revenueAnchor - a.revenueAnchor);

    const start = (clampedPage - 1) * PAGE_SIZE;
    const pageItems = rankedSectors.slice(start, start + PAGE_SIZE);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://ahousedividedgame.com";
    const sectorResults = pageItems.map(({ sector: s, revenueAnchor, liquidCurrencyCode }) => {
      const corp = corpMap.get(s.corporationId.toString());
      return {
        stateId: s.stateId,
        stateName: stateMap.get(s.stateId) ?? s.stateId,
        corporationId: s.corporationId.toString(),
        corporationName: corp?.name ?? "Unknown",
        brandColor: corp?.brandColor ?? null,
        countryId: corp?.countryId ?? null,
        corporationSequentialId: corp?.sequentialId ?? null,
        // revenue stays in the corp's own currency — pair with liquidCurrencyCode
        // for display. revenueAnchor is exposed for cross-corp comparisons.
        revenue: Math.round(sectorEconomicRevenue(s)),
        revenueAnchor: Math.round(revenueAnchor),
        liquidCurrencyCode,
        currentGrowthRate: s.currentGrowthRate ?? s.growthRate ?? 0,
        workers: calculateWorkers(s.revenue, workforceSkillMap.get(s.stateId) ?? null),
        // URLs for linking
        sectorUrl: `${baseUrl}/corporation/${corp?.sequentialId ?? corp?._id}/sector/${s._id}`,
        corporationUrl: `${baseUrl}/corporation/${corp?.sequentialId ?? corp?._id}`,
        stateUrl: `${baseUrl}/state/${s.stateId}`,
      };
    });

    return NextResponse.json({
      found: true,
      mode: "owned",
      sectorType,
      sectorLabel: OPERATING_SECTOR_TYPE_LABELS[sectorType],
      page: clampedPage,
      totalPages,
      totalItems,
      sectors: sectorResults,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
