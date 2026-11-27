import { withAtomicEconomicCommand } from "@/lib/api/withAtomicEconomicCommand";
import { newCharacterTransferBarrierResponse } from "@/lib/api/newCharacterTransferBarrier";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { getHomeCurrency, getPersonalBalance } from "@/lib/currency/characterFunds";
import { atomicallyDebitCharacterCash } from "@/lib/financialTxLog/atomicCashGuard";
import {
  anchorToCorpLiquidCapital,
  getCorpFxRate,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { emitTx } from "@/lib/financialTxLog/emit";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";

const schema = z.object({
  /** Amount in the character's home currency. */
  amount: z.number().positive("Amount must be positive"),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/corporations/[id]/capital-injection
 * CEO injects personal cash directly into a private corporation's liquid capital.
 * Only available for private (non-public, non-national) corporations.
 *
 * Body: { amount: number } — in the CEO's home currency
 * Auth: CEO only
 * Errors: 400, 401, 403, 404
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `api/corporations/[id]/capital-injection:${auth.user.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { id } = await params;
    const parsed = await parseJsonBody(request, schema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const { amount } = parsed.data;
    return await withAtomicEconomicCommand(await getDb(), async (db) => {
      const resolved = await resolveCorporation(db, id);
      if (!resolved.ok) return resolved.response;
      const { corporation } = resolved;

      // CEO check
      const ceoCheck = requireCeo(corporation, auth.user);
      if (ceoCheck) return ceoCheck;

      // Private corps only
      if (!corporation.isPrivate) {
        return errorResponse(
          400,
          "Direct capital injection is only available for private corporations. Public corps raise capital through share issuance."
        );
      }
      if (corporation.countryOwnerId) {
        return errorResponse(400, "Capital injection is not available for national corporations.");
      }

      const gameState = await gameStateCollection(db).findOne(
        { _id: "current" },
        { projection: { currentTurn: 1 } }
      );
      const currentTurn = gameState?.currentTurn ?? 0;

      // Load CEO character to get cash balance and home currency.
      if (!auth.user.activeCharacterId) return errorResponse(404, "Active character not found");
      const character = await charactersCollection(db).findOne({
        _id: new ObjectId(auth.user.activeCharacterId),
        userId: new ObjectId(auth.user.userId),
      });
      if (!character) {
        return errorResponse(404, "Character not found");
      }

      const barrier = await newCharacterTransferBarrierResponse(character);
      if (barrier) return barrier;

      const forexEnabled = await isForexEnabled();
      const homeCurrency = getHomeCurrency(character);
      const currentBalance = getPersonalBalance(character, homeCurrency, forexEnabled);

      if (currentBalance < amount) {
        return errorResponse(
          400,
          `Insufficient personal funds. You have ${homeCurrency} ${Math.floor(currentBalance).toLocaleString()} liquid; injection requires ${homeCurrency} ${amount.toLocaleString()}.`
        );
      }

      // Convert the amount from CEO home currency to corp's liquid currency.
      const fxByCurrency = await loadFxRatesByCurrency(db);
      const corpFxRate = await getCorpFxRate(db, corporation);

      // Convert CEO's home currency amount to anchor (₳), then to corp capital.
      const charCurrencyCode = homeCurrency;
      const charFxRate = fxByCurrency.get(charCurrencyCode);
      if (forexEnabled && (!charFxRate || !Number.isFinite(charFxRate) || charFxRate <= 0)) {
        return errorResponse(409, "Exchange rate unavailable. No payment was taken.");
      }
      // Amount in ₳ (anchor): local / fxRate
      const amountAnchor = forexEnabled ? amount / charFxRate! : amount;
      // Amount in corp's liquid capital currency
      const amountInCorpCapital = anchorToCorpLiquidCapital(amountAnchor, corporation, corpFxRate);

      // Debit CEO cash atomically
      const debitResult = await atomicallyDebitCharacterCash(
        db,
        character._id,
        charCurrencyCode,
        amount,
        forexEnabled
      );
      if (!debitResult.ok) {
        return errorResponse(
          400,
          "Insufficient personal funds (race condition). Please try again."
        );
      }

      const now = new Date();
      const credit = await corporationsCollection(db).updateOne(
        {
          _id: corporation._id,
          ceoId: corporation.ceoId,
          isPrivate: true,
          countryId: corporation.countryId,
          liquidCurrencyCode: corporation.liquidCurrencyCode ?? { $exists: false },
        },
        { $inc: { liquidCapital: amountInCorpCapital }, $set: { updatedAt: now } }
      );
      if (credit.matchedCount !== 1)
        return errorResponse(409, "Corporation changed. No payment was taken.");
      const corporationCurrency = resolveCorpLiquidCurrencyCode(corporation) ?? "USD";

      await emitTx(db, {
        type: "corp_capital_injection",
        turn: currentTurn,
        createdAt: now,
        subjectType: "corporation",
        subjectId: corporation._id,
        subjectName: corporation.name,
        amount: amountInCorpCapital,
        currencyCode: corporationCurrency,
        meta: {
          characterId: character._id.toString(),
          characterName: character.name,
          amountAnchor,
          sourceAmount: amount,
          sourceCurrencyCode: charCurrencyCode,
        },
      });

      return NextResponse.json({
        success: true,
        injectedAmount: amountInCorpCapital,
        currencyCode: corporationCurrency,
        sourceAmount: amount,
        sourceCurrencyCode: charCurrencyCode,
      });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
