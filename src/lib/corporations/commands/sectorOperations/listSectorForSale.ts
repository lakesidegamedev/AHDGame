/**
 * POST /api/corporations/[id]/sectors/[sectorId]/list
 * List a sector on the secondary market at SECTOR_FOR_SALE_PRICE_FRACTION × NPV.
 * CEO only. Loss-making sectors (no positive base profit) cannot be listed.
 */
import { NextResponse } from "next/server";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { requireCorporationActionsEnabled } from "@/lib/api/requireCorporationActions";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import { getSectorHostFxRate } from "@/lib/currency/corporationCapital";
import { computeSectorListingValuation } from "@/lib/corporations/sectorValuation";
import { SECTOR_FOR_SALE_PRICE_FRACTION } from "@/lib/constants/corporations";
import { getGameState } from "@/lib/gameState";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

interface RouteParams {
  params: Promise<{ id: string; sectorId: string }>;
}

/**
 * The listing quote: what a sector is worth and the price it would list at.
 * One function for the quote endpoint and the listing, so they cannot differ.
 */
async function loadListingQuote(db: Db, sector: CorporateSector, corporation: Corporation) {
  const hostFxRate = await getSectorHostFxRate(db, sector, corporation);
  const plantsEnabled = marketAtLeast(await getMarketSystemModeForDb(db), "plants");
  const gameState = await getGameState(db);
  const listingTurn = gameState?.currentTurn ?? null;
  const valuation = computeSectorListingValuation(
    sector,
    corporation,
    hostFxRate,
    plantsEnabled,
    plantsEnabled
      ? {
          sector,
          currentYear: gameState?.currentYear,
          currentTurn: listingTurn,
          eraUnitScale: await loadWorldEraUnitScale(db),
        }
      : undefined
  );
  return { valuation, plantsEnabled, listingTurn };
}

export async function listSectorForSale(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `lib/corporations/commands/sectorOperations/listSectorForSale:${auth.user.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { id, sectorId } = await params;
    const db = await getDb();
    const corpGuard = await requireCorporationActionsEnabled(db);
    if (corpGuard) return corpGuard;

    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;

    const ceoCheck = requireCeo(corporation, auth.user);
    if (ceoCheck) return ceoCheck;

    if (!ObjectId.isValid(sectorId)) {
      return errorResponse(400, "Invalid sector ID");
    }

    const sector = await corporateSectorsCollection(db).findOne({
      _id: new ObjectId(sectorId),
      corporationId: corporation._id,
    });

    if (!sector) {
      return errorResponse(404, "Sector not found");
    }
    if (
      sector.constructionPropertyTransition ||
      sector.constructionFinancing?.foreclosure ||
      (sector.constructionFinancing &&
        (!["building", "released", "cancelled"].includes(sector.constructionFinancing.status) ||
          sector.constructionFinancing.escrowLocal > 0))
    )
      return errorResponse(
        409,
        "Finish the site's pending construction or secured recovery before listing."
      );

    if (sector.forSale) {
      return errorResponse(400, "Sector is already listed for sale");
    }

    // State enterprises divest through the nationalization system (privatization),
    // which is itself gated on the regime. Letting them list on the open sector
    // market would route around that gate entirely. `requireCeo` above blocks most
    // SOEs because they are ceoVacant, but several live RU SOEs do carry a ceoId.
    if (isStateOwned(corporation)) {
      return errorResponse(403, "State enterprises cannot list production for private sale.");
    }

    // Under plants the growth-cost deduction is vestigial, so the quote leaves
    // it out; the book floor under plants is the same `sectorBookValueAnchor`
    // that abandon and dissolution settle at, so selling never beats salvaging
    // by arbitrage. The NPV boost rides the same phased path as the turn.
    const { valuation, plantsEnabled, listingTurn } = await loadListingQuote(
      db,
      sector,
      corporation
    );
    const abortedSale = sector.constructionFinancing?.sale?.aborted === true;
    if (
      abortedSale &&
      (listingTurn === null || sector.constructionFinancing!.sale!.turn >= listingTurn)
    )
      return errorResponse(409, "Retry a refused secured sale after the next turn.");

    if (valuation.priceAnchor <= 0) {
      return errorResponse(
        400,
        plantsEnabled
          ? "Cannot list a sector with no capacity and no profitability. Build capacity or improve base margin first."
          : "Cannot list a sector with no positive profitability. Improve base margin or reduce growth cost first."
      );
    }

    const now = new Date();
    const listed = await corporateSectorsCollection(db).updateOne(
      {
        _id: sector._id,
        corporationId: corporation._id,
        constructionPropertyTransition: { $exists: false },
        "constructionFinancing.foreclosure": { $exists: false },
        ...(abortedSale
          ? { "constructionFinancing.sale.key": sector.constructionFinancing!.sale!.key }
          : {}),
      },
      {
        $set: {
          forSale: {
            pledged: sector.constructionFinancing?.loanFunded === true,
            listedAt: now,
            priceAnchor: valuation.priceAnchor,
            npvAnchor: valuation.npvAnchor,
          },
          updatedAt: now,
        },
        ...(abortedSale ? { $unset: { "constructionFinancing.sale": "" } } : {}),
      }
    );
    if (listed.matchedCount === 0)
      return errorResponse(409, "The site's owner or secured recovery changed.");

    return NextResponse.json({
      success: true,
      priceAnchor: valuation.priceAnchor,
      npvAnchor: valuation.npvAnchor,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * GET /api/corporations/[id]/sectors/[sectorId]/list
 * Read-only quote for the listing confirmation: estimated worth and the price
 * the sector would list at, from the same function the listing uses.
 */
export async function quoteSectorForSale(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `lib/corporations/commands/sectorOperations/quoteSectorForSale:${auth.user.userId}`,
      60,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { id, sectorId } = await params;
    const db = await getDb();
    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;

    const ceoCheck = requireCeo(corporation, auth.user);
    if (ceoCheck) return ceoCheck;

    if (!ObjectId.isValid(sectorId)) return errorResponse(400, "Invalid sector ID");
    const sector = await corporateSectorsCollection(db).findOne({
      _id: new ObjectId(sectorId),
      corporationId: corporation._id,
    });
    if (!sector) return errorResponse(404, "Sector not found");

    const { valuation } = await loadListingQuote(db, sector, corporation);
    return NextResponse.json({
      priceAnchor: valuation.priceAnchor,
      npvAnchor: valuation.npvAnchor,
      priceFraction: SECTOR_FOR_SALE_PRICE_FRACTION,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
