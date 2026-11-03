import { stockSaleDeductions } from "@/lib/budget/rules/stockWithholding";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { resolveCorporation } from "@/lib/api/corporations/resolveQuery";
import { loadEquityQuote } from "@/lib/equities/marketPool";
import { getCorpFxRate, loadFxRatesRecord } from "@/lib/currency/corporationCapital";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import type { Character, User } from "@/lib/db/types";
import {
  loadStockWithholdingContexts,
  withholdStockReceipt,
} from "@/lib/budget/stockSaleWithholding";
import { loadPlayerIncomeTaxSummary } from "@/lib/budget/playerIncomeTaxSummary";
import { pendingStockTaxReceipt } from "@/lib/corporations/rules/stockTaxReceipt";
import {
  availableHoldingShares,
  anchorHoldingPosition,
  positionHoldingTerms,
  chooseHoldingTerm,
  takeHoldingShares,
} from "@/lib/corporations/rules/holdingTerms";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";

const schema = z.object({
  shares: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  holdingTerm: z.enum(["short", "long"]).optional(),
  pricePerShare: z.number().positive().finite().optional(),
});

/** Owner-only preview. No money moves, and execution always calculates fresh terms. */
export async function quoteSaleTax(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const limit = checkRateLimit(auth.user.userId + ":stock-tax-quote", 120, 60000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);
    const body = await parseJsonBody(request, schema);
    if (!body.success) return errorResponse(body.status, body.error);
    const db = await getDb();
    const userId = new ObjectId(auth.user.userId);
    const user = await db.collection<User>("users").findOne(
      { _id: userId },
      {
        projection: {
          activeCharacterId: 1,
          activeImperialCharacterId: 1,
          activeCharacterType: 1,
        },
      }
    );
    const imperial = user?.activeCharacterType === "imperial" && !!user.activeImperialCharacterId;
    const collection = imperial ? "imperialCharacters" : "characters";
    const activeId = imperial ? user!.activeImperialCharacterId : user?.activeCharacterId;
    const actor = await db
      .collection<Character>(collection)
      .findOne({ userId, ...(activeId ? { _id: activeId } : {}) });
    if (!actor) return errorResponse(404, "Character not found");
    const resolved = await resolveCorporation(db, (await params).id);
    if (!resolved.ok) return resolved.response;
    const corp = resolved.corporation;
    const turn = await getCurrentTurn(db);
    const [contexts, quote, fx, debtRates] = await Promise.all([
      loadStockWithholdingContexts(db, [{ id: actor._id, collection }], turn),
      loadEquityQuote(db, corp),
      getCorpFxRate(db, corp),
      loadFxRatesRecord(db),
    ]);
    const statement = await loadPlayerIncomeTaxSummary(db, actor, turn, collection, debtRates);
    const context = contexts.get(collection + ":" + actor._id.toHexString());
    const gross =
      Math.round(
        ((body.data.shares * (body.data.pricePerShare ?? quote.bidPriceLocal)) / fx) * 100
      ) / 100;
    if (!Number.isFinite(gross) || gross < 0) return errorResponse(400, "Invalid sale amount");
    let deductions = stockSaleDeductions(gross, 0);
    if (body.data.shares > 0 && context) {
      const holder = corp.shareholders?.find((row) =>
        imperial ? row.imperialCharacterId?.equals(actor._id) : row.characterId?.equals(actor._id)
      );
      const terms = positionHoldingTerms(
        anchorHoldingPosition(holder ?? { shares: 0 }, fx),
        turn,
        quote.bidPriceLocal / fx
      );
      const term = chooseHoldingTerm(terms, body.data.holdingTerm);
      if (body.data.shares > availableHoldingShares(terms, term))
        return errorResponse(400, "Insufficient shares in selected holding bucket");
      const taken = takeHoldingShares(terms, body.data.shares, term, turn).taken;
      const receipt = withholdStockReceipt(
        pendingStockTaxReceipt({
          id: "preview",
          currencyCode: context.currency,
          holdingTerms: taken,
          proceedsAnchor: gross,
          proceedsCredited: gross * context.walletFx,
          saleTurn: turn,
          assessmentTurn: turn + 1,
        }),
        context
      );
      deductions = stockSaleDeductions(gross, receipt.amount, receipt);
    }
    return NextResponse.json({
      grossProceeds: gross,
      ...deductions,
      outstandingArrears: statement.unpaidTaxAnchor,
      turn,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
