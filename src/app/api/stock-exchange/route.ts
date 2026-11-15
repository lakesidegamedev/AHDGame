import { conditionalJson } from "@/lib/api/conditionalJson";
import { parsePreviewRows, topStocksForPreview } from "@/lib/market/overviewPreview";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import type { StockExchangeSnapshot } from "@/lib/db/types";
import { EXCHANGE_API_KEYS, getExchangeLabel } from "@/lib/constants/exchangeRegistry";
import { stockExchangeSnapshotsCollection } from "@/lib/db/repositories/stockExchangeSnapshots";

/**
 * GET /api/stock-exchange?exchange=nyse|ftse|nikkei|tsx|dax|global
 * Returns pre-computed stock exchange data from the snapshot collection.
 * Snapshots are rebuilt each turn and refreshed every five minutes for intraday float/price.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get("exchange")?.toLowerCase();
    const previewRows = parsePreviewRows(searchParams.get("preview"));

    if (!exchange || !EXCHANGE_API_KEYS.has(exchange)) {
      return errorResponse(
        400,
        `Invalid exchange. Use one of: ${[...EXCHANGE_API_KEYS].join(", ")}`
      );
    }

    const db = await getDb();

    // Read from pre-computed snapshot (single document read)
    const snapshot = await stockExchangeSnapshotsCollection(db).findOne({ _id: exchange });

    if (!snapshot) {
      // Fallback: return empty listings if snapshot doesn't exist yet
      // (e.g., before first turn processing after deployment)
      return conditionalJson(request, {
        exchange: exchange.toUpperCase(),
        exchangeName: getExchangeLabel(exchange),
        listings: [],
        unlistedPrivateCount: 0,
        turn: 0,
        asOf: null,
      });
    }

    return conditionalJson(request, {
      exchange: exchange.toUpperCase(),
      exchangeName: snapshot.exchangeName,
      listings: previewRows
        ? topStocksForPreview(snapshot.listings, previewRows)
        : snapshot.listings,
      unlistedPrivateCount: snapshot.unlistedPrivateCount ?? 0,
      turn: snapshot.turn,
      asOf: snapshot.createdAt,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
