import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/api/withNoStore";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { handleRouteError, notFound, errorResponse } from "@/lib/api/errors";
import { isIndexFundsEnabled } from "@/lib/indexFunds/featureFlag";
import {
  listCharacterPositions,
  listFundsByIds,
  listCharacterFundTransactions,
} from "@/lib/indexFunds/fundQueries";
import { enrichFundPositions } from "@/lib/indexFunds/fundPortfolioView";
import { INDEX_FUNDS_DISABLED_MESSAGE } from "@/lib/indexFunds/featureFlag";

// GET /api/character/[id]/fund-portfolio — Character's fund positions and recent transactions
// Auth: the character owner or admin
async function handleGET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUserWithCharacter();
    if (!auth) return errorResponse(401, "Authentication required");

    const db = await getDb();
    if (!(await isIndexFundsEnabled())) {
      return errorResponse(403, INDEX_FUNDS_DISABLED_MESSAGE);
    }

    const { id } = await params;
    let characterId: ObjectId;
    try {
      characterId = new ObjectId(id);
    } catch {
      throw notFound("Invalid character ID");
    }

    // Access check: only the character owner or admin can view portfolio.
    if (!auth.isAdmin && auth.character?._id?.toString() !== characterId.toString()) {
      return errorResponse(403, "Access denied");
    }

    const positions = await listCharacterPositions(db, characterId);

    // Enrich positions with fund details — one batched fund load instead of a
    // findOne per position.
    const uniqueFundIds = [
      ...new Map(positions.map((pos) => [pos.fundId.toString(), pos.fundId])).values(),
    ];
    const funds = await listFundsByIds(db, uniqueFundIds);
    const enrichedPositions = enrichFundPositions(positions, funds);

    // Recent transactions for this character.
    const transactions = await listCharacterFundTransactions(db, characterId, 30);

    return NextResponse.json({
      positions: enrichedPositions,
      transactions: transactions.map((tx) => ({
        id: tx._id.toString(),
        fundId: tx.fundId.toString(), // internal ObjectId — used only for dedup key
        kind: tx.kind,
        units: tx.units ?? null,
        navAnchor: tx.navAnchor ?? null,
        amountAnchor: tx.amountAnchor,
        note: tx.note ?? null,
        createdAt: tx.createdAt,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);
