import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/api/withNoStore";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import type { Character } from "@/lib/db/types";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { parseCharacterId } from "@/lib/utils/profileUrls";
import { loadPortfolioForCharacter } from "@/lib/portfolio/loadCharacterPortfolio";
interface RouteParams {
  params: Promise<{ id: string }>;
}
async function handleGET(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const parsed = parseCharacterId(id);
    if (!parsed) return errorResponse(400, "Invalid character ID");
    const [db, forexEnabled] = await Promise.all([getDb(), isForexEnabled()]);
    let character: Character | null = null;

    if (parsed.type === "sequential") {
      character = await db
        .collection<Character>("characters")
        .findOne({ sequentialId: parsed.value });
    } else {
      // ObjectId lookup
      character = await db
        .collection<Character>("characters")
        .findOne({ _id: new ObjectId(parsed.value) });
    }

    if (!character) {
      return errorResponse(404, "Character not found");
    }

    const portfolio = await loadPortfolioForCharacter(db, character, forexEnabled, {
      profile: true,
    });
    return NextResponse.json({
      holdings: portfolio.holdings.map((holding) => ({
        corporationId: holding.corporationId,
        corporationName: holding.corporationName,
        sequentialId: holding.sequentialId,
        shares: holding.shares,
        sharePrice: holding.sharePrice,
        totalValue: holding.totalValue,
        logoUrl: holding.logoUrl,
        brandColor: holding.brandColor,
        currencyCode: holding.currencyCode,
      })),
      bondHoldings: portfolio.bondHoldings,
      totalValue: portfolio.totalValue,
      totalBondValue: portfolio.totalBondValue,
      totalBondIncomePerTurn: portfolio.totalBondIncomePerTurn,
      totalFundValue: portfolio.totalFundValue,
      cashOnHand: portfolio.cashOnHand,
      locDebtValue: portfolio.locDebtValue,
      incomeTaxDebtValue: portfolio.incomeTaxDebtValue,
      characterName: character.name,
      characterId: character._id.toString(),
      isOwnProfile: false,
      history: portfolio.history.map((point) => ({
        turn: point.turn,
        totalValue: point.totalValue,
        netValue: point.netValue,
        stockValue: point.stockValue,
        bondValue: point.bondValue,
        fundValue: point.fundValue,
        cashValue: point.cashValue,
        liquidCashValue: point.liquidCashValue,
        savingsCashValue: point.savingsCashValue,
        locDebtValue: point.locDebtValue,
        incomeTaxDebtValue: point.incomeTaxDebtValue,
        exchangeRatesSnapshot: point.exchangeRatesSnapshot,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
export const GET = withNoStore(handleGET);
