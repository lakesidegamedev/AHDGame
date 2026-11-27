import { getDb } from "@/lib/mongodb";
import { withAtomicEconomicCommand } from "@/lib/api/withAtomicEconomicCommand";
import { afterCommit, unboundDb } from "@/lib/db/sessionDb";
import {
  parseShareOrderRequest,
  prepareShareOrder,
} from "@/lib/corporations/commands/shareTrading/prepareShareOrder";
import { stockSaleDeductions } from "@/lib/budget/rules/stockWithholding";
import {
  loadStockWithholdingContexts,
  stockSellerKey,
  withholdStockReceipt,
  netStockProceeds,
} from "@/lib/budget/stockSaleWithholding";
/**
 * Share orders reserve funding for purchases and expose shares for sale.
 * placeShareOrder prices corporate currency conversion using the source authority.
 */

import { assertForeignControlAllowed, wouldGainControl } from "@/lib/mechanicalLaws/guards";
import { loadForexSpreadStrengths } from "@/lib/currency/euro/quotes";
import { loadEuroMonetaryUnion } from "@/lib/currency/euro/service";
import { NextResponse } from "next/server";
import {
  availableHoldingShares,
  chooseHoldingTerm,
  positionHoldingTerms,
  purchasedHoldingTerms,
  type HoldingTerm,
} from "@/lib/corporations/rules/holdingTerms";
import { pendingStockTaxReceipt } from "@/lib/corporations/rules/stockTaxReceipt";
import type { PersonalHoldingChange } from "@/lib/corporations/personalHoldingOps";
import { ObjectId } from "mongodb";

import { handleRouteError, errorResponse } from "@/lib/api/errors";

import {
  corpPurchaseWouldCycle,
  OWNERSHIP_CYCLE_ERROR,
} from "@/lib/corporations/subsidiaries/cycleGuard";

import {
  creditShares,
  debitShares,
  creditSharesToCorp,
  debitSharesFromCorp,
} from "@/lib/corporations/shareholderOps";

import { buildPersonalBalanceInc, loadCharacterFxRate } from "@/lib/currency/characterFunds";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  estimateCorpWalletSpend,
  getCorpFxRate,
  loadFxRatesRecord,
  resolveCorpLiquidCurrencyCode,
  shareTradeAnchorValue,
} from "@/lib/currency/corporationCapital";
import { distributeConversionSpread } from "@/lib/currency/marketMaker";
import { notifyHostileTakeoverThresholdIfEligible } from "@/lib/corporations/hostileTakeoverNotifications";
import { recordShareTrade } from "@/lib/corporations/shareTradeHistory";

import {
  atomicallyDebitCharacterCash,
  refundCharacterCash,
  atomicallyDebitCorpLiquidCapital,
  refundCorpLiquidCapital,
} from "@/lib/financialTxLog/atomicCashGuard";
import {
  applyFloatBuyCredit,
  reverseFloatSellDebit,
  onFloatSellCommitted,
} from "@/lib/corporations/shareEscrowSettlement";

import { emitTx } from "@/lib/financialTxLog/emit";

import { recordAudit } from "@/lib/audit/recordAudit";

import { corporationsCollection } from "@/lib/db/repositories/corporations";
import {
  checkCorpPurchaseReserve,
  corpPurchaseReserveResponse,
} from "@/lib/corporations/operatingReserveGuard";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { shareOrdersCollection } from "@/lib/db/repositories/shareOrders";

export interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/corporations/[id]/shares/orders
 * Place a limit buy or sell order.
 *
 * Buy order: money escrowed immediately from corp `liquidCapital` or character
 * `currencyBalances.personal`. If current price <= limit price, fills immediately
 * from public float. Otherwise stays open until price drops.
 *
 * Sell order: shares debited from holdings immediately (`sharesDebitedAtCreation`).
 *   If current price >= limit price, fills immediately (money credited).
 *   Otherwise stays open until price rises.
 */
export async function placeShareOrder(request: Request, route: RouteParams) {
  try {
    const input = await parseShareOrderRequest(request, route);
    if (input.kind === "early") return input.value;
    return await withAtomicEconomicCommand(await getDb(), async (transactionDb) => {
      const prepared = await prepareShareOrder(transactionDb, input.context);
      if (prepared.kind === "early") return prepared.value;
      const {
        character,
        corporation,
        currentTurn,
        db,
        executionPrice,
        forexEnabled,
        gateIssuerBuyback,
        homeCurrency,
        issuerBuyback,
        issuerBuybackSplit,
        now,
        orderFlowEligible,
        parsed,
        placeAsCorporation,
        pricePerShare,
        sellExceedsPoolAllowance,
        shares,
        targetFxRate,
        type,
      } = prepared.context;

      if (placeAsCorporation) {
        const placerCorp = await corporationsCollection(db).findOne({
          ceoId: character._id,
          ceoVacant: { $ne: true },
        });
        if (!placerCorp) {
          return errorResponse(
            403,
            "You must be an active CEO to place orders on behalf of a corporation"
          );
        }

        if (placerCorp._id.equals(corporation._id)) {
          return errorResponse(400, "A corporation cannot trade its own shares");
        }

        if (placerCorp.countryOwnerId) {
          return errorResponse(400, "National corporations cannot hold equity positions");
        }

        if (type === "buy" && (await corpPurchaseWouldCycle(db, placerCorp._id, corporation._id))) {
          return errorResponse(400, OWNERSHIP_CYCLE_ERROR);
        }
        if (type === "buy" && wouldGainControl(corporation, placerCorp._id, shares)) {
          const foreignRejection = await assertForeignControlAllowed(db, placerCorp, corporation, {
            viaMarket: true,
          });
          if (foreignRejection)
            return errorResponse(foreignRejection.status, foreignRejection.error);
        }

        const placerFxRate = await getCorpFxRate(db, placerCorp);
        const placerCurrency = (resolveCorpLiquidCurrencyCode(placerCorp) ?? "USD") as CurrencyCode;
        const targetCurrency = (resolveCorpLiquidCurrencyCode(corporation) ??
          "USD") as CurrencyCode;
        const fxRates = await loadFxRatesRecord(db);

        if (type === "buy") {
          const fillsNow = executionPrice <= pricePerShare;
          const publicFloat = corporation.publicFloat ?? 0;

          if (fillsNow && publicFloat >= shares) {
            const cost = shareTradeAnchorValue(
              shares,
              { ...corporation, sharePrice: executionPrice },
              targetFxRate
            );
            const corpPurchaseEstimate = estimateCorpWalletSpend({
              union: await loadEuroMonetaryUnion(db),
              spreadStrengths: await loadForexSpreadStrengths(db),
              requiredAmount: shares * executionPrice,
              availableBalance: placerCorp.liquidCapital ?? 0,
              fromCurrency: placerCurrency,
              toCurrency: targetCurrency,
              rates: fxRates,
            });
            if (!corpPurchaseEstimate) {
              return errorResponse(503, "Exchange rate unavailable, try again shortly");
            }
            const costInPlacerCapital =
              placerCurrency !== targetCurrency
                ? corpPurchaseEstimate.spendAmount
                : anchorToCorpLiquidCapital(cost, placerCorp, placerFxRate);
            const reserveCheck = await checkCorpPurchaseReserve(db, {
              corporation: placerCorp,
              costLocal: costInPlacerCapital,
              confirmed: parsed.data.overrideOperatingReserve === true,
            });
            if (!reserveCheck.ok) return corpPurchaseReserveResponse(reserveCheck);
            // Atomic balance-gated debit on the placer corp's liquidCapital.
            // Same race-fix as bond-buy/share-buy: read-then-write check on
            // placerCapitalAnchor would let concurrent buys both pass the
            // staleness check and silently overspend or split-debit.
            const corpDebit = await atomicallyDebitCorpLiquidCapital(
              db,
              placerCorp._id,
              costInPlacerCapital
            );
            if (!corpDebit.ok) {
              return errorResponse(400, "Insufficient corporation funds");
            }
            let sharesCredited = false;
            try {
              const credited = await creditSharesToCorp(
                db,
                corporation._id,
                placerCorp._id,
                shares,
                executionPrice,
                {
                  $inc: {
                    publicFloat: -shares,
                    ...(orderFlowEligible
                      ? { orderFlowWindowBuyValue: shares * executionPrice }
                      : {}),
                  },
                  $set: { updatedAt: now },
                },
                { guardFilter: { publicFloat: { $gte: shares } } }
              );
              if (!credited) {
                await refundCorpLiquidCapital(db, placerCorp._id, costInPlacerCapital);
                return errorResponse(409, "Not enough shares remain in public float");
              }
              sharesCredited = true;
              await recordShareTrade(db, {
                corporationId: corporation._id,
                kind: "limit_fill",
                turn: currentTurn,
                shares,
                pricePerShareAnchor: cost / shares,
                from: null,
                to: { corporationId: placerCorp._id, name: placerCorp.name },
                corpCurrencyCode: corporation.liquidCurrencyCode,
              });
              await afterCommit(db, () =>
                notifyHostileTakeoverThresholdIfEligible(unboundDb(db), corporation._id)
              );
              await emitTx(db, {
                type: "stock_trade_buy",
                turn: currentTurn,
                createdAt: now,
                subjectType: "corporation",
                subjectId: placerCorp._id,
                subjectName: placerCorp.name,
                amount: -costInPlacerCapital,
                balanceAfter: corpDebit.newBalance,
                currencyCode: resolveCorpLiquidCurrencyCode(placerCorp) ?? "USD",
                counterpartyType: "corporation",
                counterpartyId: corporation._id,
                counterpartyName: corporation.name,
                meta: {
                  corporationId: corporation._id.toString(),
                  shares,
                  pricePerShare: executionPrice,
                  source: "limit_order_immediate_fill",
                },
              });

              // Treasury-backed market maker: inject the buyer's payment into the
              // issuer treasury. Last in the try — a throw rolls back via the catch.
              await applyFloatBuyCredit(db, corporation, shares * executionPrice, {
                sharesBought: shares,
              });

              // Cross-currency immediate fill realizes the spread now — route it to
              // the CB system. (Resting-order escrow defers its spread to fill time.)
              if (placerCurrency !== targetCurrency) {
                await distributeConversionSpread(
                  db,
                  corpPurchaseEstimate.spreadFee,
                  placerCurrency,
                  targetCurrency
                );
              }
            } catch (err) {
              if (sharesCredited) {
                await debitSharesFromCorp(
                  db,
                  corporation._id,
                  placerCorp._id,
                  shares,
                  {
                    $inc: {
                      publicFloat: shares,
                      ...(orderFlowEligible
                        ? { orderFlowWindowBuyValue: -(shares * executionPrice) }
                        : {}),
                    },
                    $set: { updatedAt: new Date() },
                  },
                  { requireSufficient: true }
                );
              }
              await refundCorpLiquidCapital(db, placerCorp._id, costInPlacerCapital);
              throw err;
            }
            await afterCommit(db, async () => {
              recordAudit({
                source: "api",
                action: "share.order",
                category: "market",
                subject: { type: "corporation", id: corporation._id, name: corporation.name },
                counterparty: { type: "corporation", id: placerCorp._id, name: placerCorp.name },
                amount: -costInPlacerCapital,
                currencyCode: placerCurrency,
                refs: { corporationId: corporation._id },
                delta: [
                  { field: "orderType", before: null, after: "buy" },
                  { field: "status", before: null, after: "filled" },
                  { field: "shares", before: null, after: shares },
                  { field: "pricePerShare", before: null, after: executionPrice },
                ],
                outcome: "ok",
              });
            });
            return NextResponse.json({
              success: true,
              filled: true,
              sharesBought: shares,
              cost: Math.round(cost * 100) / 100,
              spreadPaid:
                placerCurrency !== targetCurrency
                  ? Math.round(corpPurchaseEstimate.spreadFee * 100) / 100
                  : 0,
              spreadCurrency: placerCurrency,
            });
          }

          // pricePerShare is specified by the user in the target corp's local
          // currency. Escrow is STORED in that same currency (Option B) so that
          // partial fills subtract cleanly and cancels/refunds are FX-stable
          // relative to the fill math. Wallet debit/credit converts via ₳.
          const escrowAmount = shares * pricePerShare;
          const escrowAnchor = corpLiquidCapitalToAnchor(escrowAmount, corporation, targetFxRate);
          const escrowEstimate = estimateCorpWalletSpend({
            union: await loadEuroMonetaryUnion(db),
            spreadStrengths: await loadForexSpreadStrengths(db),
            requiredAmount: escrowAmount,
            availableBalance: placerCorp.liquidCapital ?? 0,
            fromCurrency: placerCurrency,
            toCurrency: targetCurrency,
            rates: fxRates,
          });
          if (!escrowEstimate) {
            return errorResponse(503, "Exchange rate unavailable, try again shortly");
          }
          const escrowInPlacerCapital =
            placerCurrency !== targetCurrency
              ? escrowEstimate.spendAmount
              : anchorToCorpLiquidCapital(escrowAnchor, placerCorp, placerFxRate);
          // A resting order takes its cash now, as escrow, so the reserve is held
          // here. A confirmed order is marked so the turn does not trim it later.
          const escrowReserveCheck = await checkCorpPurchaseReserve(db, {
            corporation: placerCorp,
            costLocal: escrowInPlacerCapital,
            confirmed: parsed.data.overrideOperatingReserve === true,
          });
          if (!escrowReserveCheck.ok) return corpPurchaseReserveResponse(escrowReserveCheck);
          const escrowDebit = await atomicallyDebitCorpLiquidCapital(
            db,
            placerCorp._id,
            escrowInPlacerCapital
          );
          if (!escrowDebit.ok) {
            return errorResponse(400, "Insufficient corporation funds for escrow");
          }
          try {
            await shareOrdersCollection(db).insertOne({
              _id: new ObjectId(),
              corporationId: corporation._id,
              characterId: character._id,
              placerCorporationId: placerCorp._id,
              type: "buy",
              shares,
              sharesRemaining: shares,
              pricePerShare,
              escrowAmount,
              status: "open",
              ...(parsed.data.overrideOperatingReserve === true
                ? { operatingReserveOverride: true }
                : {}),
              createdAt: now,
              updatedAt: now,
            });
            await emitTx(db, {
              type: "stock_order_escrow",
              turn: currentTurn,
              createdAt: now,
              subjectType: "corporation",
              subjectId: placerCorp._id,
              subjectName: placerCorp.name,
              amount: -escrowInPlacerCapital,
              balanceAfter: escrowDebit.newBalance,
              currencyCode: resolveCorpLiquidCurrencyCode(placerCorp) ?? "USD",
              counterpartyType: "system",
              counterpartyName: "Order book escrow",
              meta: {
                corporationId: corporation._id.toString(),
                shares,
                pricePerShare,
              },
            });
          } catch (err) {
            await refundCorpLiquidCapital(db, placerCorp._id, escrowInPlacerCapital);
            throw err;
          }
          // The placer's FX spread is consumed at placement — cancel refunds only
          // the share value (escrowAmount), not the spread markup — so route it to
          // the CB system now. Correct for both eventual fill and cancel, and
          // placed after the try so an insert failure (which fully refunds) can't
          // leave the spread distributed.
          if (placerCurrency !== targetCurrency) {
            await distributeConversionSpread(
              db,
              escrowEstimate.spreadFee,
              placerCurrency,
              targetCurrency
            );
          }
          await afterCommit(db, async () => {
            recordAudit({
              source: "api",
              action: "share.order",
              category: "market",
              subject: { type: "corporation", id: corporation._id, name: corporation.name },
              counterparty: { type: "corporation", id: placerCorp._id, name: placerCorp.name },
              amount: -escrowInPlacerCapital,
              currencyCode: placerCurrency,
              refs: { corporationId: corporation._id },
              delta: [
                { field: "orderType", before: null, after: "buy" },
                { field: "status", before: null, after: "open" },
                { field: "shares", before: null, after: shares },
                { field: "pricePerShare", before: null, after: pricePerShare },
              ],
              outcome: "ok",
            });
          });
          return NextResponse.json({
            success: true,
            filled: false,
            escrowAmount,
            spreadPaid:
              placerCurrency !== targetCurrency
                ? Math.round(escrowEstimate.spreadFee * 100) / 100
                : 0,
            spreadCurrency: placerCurrency,
          });
        } else {
          // Corp sell limit order
          const shareholderEntry = corporation.shareholders?.find(
            (sh) => sh.corporationId?.toString() === placerCorp._id.toString()
          );
          const ownedShares = shareholderEntry?.shares ?? 0;
          const openSellOrders = await shareOrdersCollection(db)
            .find({
              corporationId: corporation._id,
              placerCorporationId: placerCorp._id,
              type: "sell",
              status: "open",
            })
            .toArray();
          const alreadyReserved = openSellOrders.reduce(
            (sum, o) => sum + (o.sharesDebitedAtCreation ? 0 : o.sharesRemaining),
            0
          );
          const available = ownedShares - alreadyReserved;
          if (available < shares) {
            return errorResponse(400, `Only ${available.toLocaleString()} shares available`);
          }
          const fillsNow = executionPrice >= pricePerShare && !(await sellExceedsPoolAllowance());
          if (fillsNow) {
            const proceeds =
              Math.round(
                shareTradeAnchorValue(
                  shares,
                  { ...corporation, sharePrice: executionPrice },
                  targetFxRate
                ) * 100
              ) / 100;
            const proceedsInPlacerCapital = anchorToCorpLiquidCapital(
              proceeds,
              placerCorp,
              placerFxRate
            );
            const buybackGate = await gateIssuerBuyback();
            if (buybackGate) return buybackGate;
            const remainingAfterSale = await debitSharesFromCorp(
              db,
              corporation._id,
              placerCorp._id,
              shares,
              {
                $inc: {
                  publicFloat: shares,
                  ...(orderFlowEligible
                    ? { orderFlowWindowSellValue: shares * executionPrice }
                    : {}),
                },
                $set: { updatedAt: now },
              },
              { requireSufficient: true }
            );
            if (remainingAfterSale < 0) {
              await reverseFloatSellDebit(db, corporation, issuerBuyback, {
                split: issuerBuybackSplit,
              });
              return errorResponse(409, "Shares were already sold or reserved by another action");
            }
            let sellerCredited = false;
            try {
              const sellerCredit = await corporationsCollection(db).updateOne(
                { _id: placerCorp._id },
                { $inc: { liquidCapital: proceedsInPlacerCapital }, $set: { updatedAt: now } }
              );
              if (sellerCredit.matchedCount === 0) {
                throw new Error("Seller corporation not found");
              }
              sellerCredited = true;
              await recordShareTrade(db, {
                corporationId: corporation._id,
                kind: "limit_fill",
                turn: currentTurn,
                shares,
                pricePerShareAnchor: proceeds / shares,
                from: { corporationId: placerCorp._id, name: placerCorp.name },
                to: null,
                corpCurrencyCode: corporation.liquidCurrencyCode,
              });
              await emitTx(db, {
                type: "stock_trade_sell",
                turn: currentTurn,
                createdAt: now,
                subjectType: "corporation",
                subjectId: placerCorp._id,
                subjectName: placerCorp.name,
                amount: proceedsInPlacerCapital,
                currencyCode: resolveCorpLiquidCurrencyCode(placerCorp) ?? "USD",
                counterpartyType: "corporation",
                counterpartyId: corporation._id,
                counterpartyName: corporation.name,
                meta: {
                  corporationId: corporation._id.toString(),
                  shares,
                  pricePerShare: executionPrice,
                  source: "limit_order_immediate_fill",
                },
              });
            } catch (err) {
              if (sellerCredited) {
                await corporationsCollection(db).updateOne(
                  { _id: placerCorp._id },
                  {
                    $inc: { liquidCapital: -proceedsInPlacerCapital },
                    $set: { updatedAt: new Date() },
                  }
                );
              }
              await creditSharesToCorp(
                db,
                corporation._id,
                placerCorp._id,
                shares,
                shareholderEntry?.avgCostPerShare ?? executionPrice,
                {
                  $inc: {
                    publicFloat: -shares,
                    ...(orderFlowEligible
                      ? { orderFlowWindowSellValue: -(shares * executionPrice) }
                      : {}),
                  },
                  $set: { updatedAt: new Date() },
                }
              );
              await reverseFloatSellDebit(db, corporation, issuerBuyback, {
                split: issuerBuybackSplit,
              });
              throw err;
            }
            // Sell-fill committed: back out realized issuance proceeds to match the
            // float shrinking (mirrors the buy-side credit). Best-effort/terminal.
            await onFloatSellCommitted(db, corporation, issuerBuyback);
            await afterCommit(db, async () => {
              recordAudit({
                source: "api",
                action: "share.order",
                category: "market",
                subject: { type: "corporation", id: corporation._id, name: corporation.name },
                counterparty: { type: "corporation", id: placerCorp._id, name: placerCorp.name },
                amount: proceedsInPlacerCapital,
                currencyCode: resolveCorpLiquidCurrencyCode(placerCorp) ?? "USD",
                refs: { corporationId: corporation._id },
                delta: [
                  { field: "orderType", before: null, after: "sell" },
                  { field: "status", before: null, after: "filled" },
                  { field: "shares", before: null, after: shares },
                  { field: "pricePerShare", before: null, after: executionPrice },
                ],
                outcome: "ok",
              });
            });
            return NextResponse.json({ success: true, filled: true, sharesSold: shares, proceeds });
          }
          // Reserve shares by debiting from corp position
          const reservedCorpShares = await debitSharesFromCorp(
            db,
            corporation._id,
            placerCorp._id,
            shares,
            {
              $set: { updatedAt: now },
            },
            { requireSufficient: true }
          );
          if (reservedCorpShares < 0) {
            return errorResponse(409, "Shares were already sold or reserved by another action");
          }
          try {
            await shareOrdersCollection(db).insertOne({
              _id: new ObjectId(),
              corporationId: corporation._id,
              characterId: character._id,
              placerCorporationId: placerCorp._id,
              type: "sell",
              shares,
              sharesRemaining: shares,
              sharesDebitedAtCreation: true,
              pricePerShare,
              escrowAmount: 0,
              status: "open",
              createdAt: now,
              updatedAt: now,
            });
          } catch (error) {
            await creditSharesToCorp(
              db,
              corporation._id,
              placerCorp._id,
              shares,
              shareholderEntry?.avgCostPerShare ?? corporation.sharePrice,
              { $set: { updatedAt: new Date() } }
            );
            throw error;
          }
          await afterCommit(db, async () => {
            recordAudit({
              source: "api",
              action: "share.order",
              category: "market",
              subject: { type: "corporation", id: corporation._id, name: corporation.name },
              counterparty: { type: "corporation", id: placerCorp._id, name: placerCorp.name },
              refs: { corporationId: corporation._id },
              delta: [
                { field: "orderType", before: null, after: "sell" },
                { field: "status", before: null, after: "open" },
                { field: "shares", before: null, after: shares },
                { field: "pricePerShare", before: null, after: pricePerShare },
              ],
              outcome: "ok",
            });
          });
          return NextResponse.json({ success: true, filled: false, sharesReserved: shares });
        }
      }

      // Load character FX rate once for all character wallet operations.
      // escrowAmount stored in DB is in the target corp's liquidCurrencyCode
      // (Option B). Wallet debits/credits hop through ₳ via targetFxRate.
      let charFxRate = 1.0;
      if (forexEnabled) {
        const fxResult = await loadCharacterFxRate(db, homeCurrency);
        if (!fxResult.ok) {
          return errorResponse(503, "Exchange rate unavailable, try again shortly");
        }
        charFxRate = fxResult.rate;
      }

      if (type === "buy") {
        // Check if fills immediately (current price <= limit)
        const fillsNow = executionPrice <= pricePerShare;
        const publicFloat = corporation.publicFloat ?? 0;

        if (fillsNow && publicFloat >= shares) {
          // Immediate fill at current market price
          const cost = shareTradeAnchorValue(
            shares,
            { ...corporation, sharePrice: executionPrice },
            targetFxRate
          );
          const costInHome = cost * charFxRate;
          // Atomic balance-gated debit on the buyer's wallet so concurrent
          // limit buys cannot both pass a stale balance check and overspend.
          const debitResult = await atomicallyDebitCharacterCash(
            db,
            character._id,
            homeCurrency,
            costInHome,
            forexEnabled
          );
          if (!debitResult.ok) {
            return errorResponse(400, "Insufficient funds for immediate fill");
          }
          let sharesCredited = false;
          try {
            const credited = await creditShares(
              db,
              corporation._id,
              character._id,
              shares,
              {
                $inc: {
                  publicFloat: -shares,
                  ...(orderFlowEligible
                    ? { orderFlowWindowBuyValue: shares * executionPrice }
                    : {}),
                },
                $set: { updatedAt: now },
              },
              {
                pricePerShare: cost / shares,
                holdingChange: { turn: currentTurn },
                guardFilter: { publicFloat: { $gte: shares } },
              }
            );
            if (!credited) {
              await refundCharacterCash(db, character._id, homeCurrency, costInHome, forexEnabled);
              return errorResponse(409, "Not enough shares remain in public float");
            }
            sharesCredited = true;
            await recordShareTrade(db, {
              corporationId: corporation._id,
              kind: "limit_fill",
              turn: currentTurn,
              shares,
              pricePerShareAnchor: cost / shares,
              from: null,
              to: { characterId: character._id, name: character.name },
              corpCurrencyCode: corporation.liquidCurrencyCode,
            });
            await emitTx(db, {
              type: "stock_trade_buy",
              turn: currentTurn,
              createdAt: now,
              subjectType: "character",
              subjectId: character._id,
              subjectName: character.name,
              amount: -costInHome,
              balanceAfter: debitResult.newBalance,
              currencyCode: homeCurrency,
              counterpartyType: "corporation",
              counterpartyId: corporation._id,
              counterpartyName: corporation.name,
              meta: {
                corporationId: corporation._id.toString(),
                shares,
                pricePerShare: executionPrice,
                source: "limit_order_immediate_fill",
              },
            });

            // Treasury-backed market maker: inject the buyer's payment into the
            // issuer treasury. Last in the try — a throw rolls back via the catch.
            await applyFloatBuyCredit(db, corporation, shares * executionPrice, {
              sharesBought: shares,
            });
          } catch (err) {
            if (sharesCredited) {
              await debitShares(
                db,
                corporation._id,
                character._id,
                shares,
                {
                  $inc: {
                    publicFloat: shares,
                    ...(orderFlowEligible
                      ? { orderFlowWindowBuyValue: -(shares * executionPrice) }
                      : {}),
                  },
                  $set: { updatedAt: new Date() },
                },
                {
                  requireSufficient: true,
                  holdingChange: {
                    turn: currentTurn,
                    remove: purchasedHoldingTerms(shares, cost / shares, currentTurn),
                  },
                }
              );
            }
            await refundCharacterCash(db, character._id, homeCurrency, costInHome, forexEnabled);
            throw err;
          }

          await afterCommit(db, async () => {
            recordAudit({
              source: "api",
              action: "share.order",
              category: "market",
              subject: { type: "corporation", id: corporation._id, name: corporation.name },
              counterparty: { type: "character", id: character._id, name: character.name },
              amount: -costInHome,
              currencyCode: homeCurrency,
              refs: { corporationId: corporation._id },
              delta: [
                { field: "orderType", before: null, after: "buy" },
                { field: "status", before: null, after: "filled" },
                { field: "shares", before: null, after: shares },
                { field: "pricePerShare", before: null, after: executionPrice },
              ],
              outcome: "ok",
            });
          });
          return NextResponse.json({
            success: true,
            filled: true,
            sharesBought: shares,
            cost: Math.round(cost * 100) / 100,
          });
        }

        // Pending buy order — escrow stored in target corp's local currency
        // (Option B). Wallet debit converts local → ₳ → char home via the
        // target's FX; the stored escrowAmount is FX-stable against fill cost
        // because both are `shares × pricePerShare` in the same currency.
        const escrowAmount = shares * pricePerShare;
        const escrowAnchor = corpLiquidCapitalToAnchor(escrowAmount, corporation, targetFxRate);
        const escrowInHome = escrowAnchor * charFxRate;
        const escrowDebit = await atomicallyDebitCharacterCash(
          db,
          character._id,
          homeCurrency,
          escrowInHome,
          forexEnabled
        );
        if (!escrowDebit.ok) {
          return errorResponse(
            400,
            `Insufficient funds. Need ${escrowInHome.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${homeCurrency} in escrow`
          );
        }
        try {
          await shareOrdersCollection(db).insertOne({
            _id: new ObjectId(),
            corporationId: corporation._id,
            characterId: character._id,
            type: "buy",
            shares,
            sharesRemaining: shares,
            pricePerShare,
            escrowAmount,
            status: "open",
            createdAt: now,
            updatedAt: now,
          });
          await emitTx(db, {
            type: "stock_order_escrow",
            turn: currentTurn,
            createdAt: now,
            subjectType: "character",
            subjectId: character._id,
            subjectName: character.name,
            amount: -escrowInHome,
            balanceAfter: escrowDebit.newBalance,
            currencyCode: homeCurrency,
            counterpartyType: "system",
            counterpartyName: "Order book escrow",
            meta: {
              corporationId: corporation._id.toString(),
              shares,
              pricePerShare,
            },
          });
        } catch (err) {
          await refundCharacterCash(db, character._id, homeCurrency, escrowInHome, forexEnabled);
          throw err;
        }

        await afterCommit(db, async () => {
          recordAudit({
            source: "api",
            action: "share.order",
            category: "market",
            subject: { type: "corporation", id: corporation._id, name: corporation.name },
            counterparty: { type: "character", id: character._id, name: character.name },
            amount: -escrowInHome,
            currencyCode: homeCurrency,
            refs: { corporationId: corporation._id },
            delta: [
              { field: "orderType", before: null, after: "buy" },
              { field: "status", before: null, after: "open" },
              { field: "shares", before: null, after: shares },
              { field: "pricePerShare", before: null, after: pricePerShare },
            ],
            outcome: "ok",
          });
        });
        return NextResponse.json({ success: true, filled: false, escrowAmount });
      } else {
        // Sell order — validate and reserve shares
        const shareholderEntry = corporation.shareholders?.find(
          (sh) => sh.characterId?.toString() === character._id.toString()
        );
        const ownedShares = shareholderEntry?.shares ?? 0;

        // Also check for already-reserved shares in open sell orders
        const openSellOrders = await shareOrdersCollection(db)
          .find({
            corporationId: corporation._id,
            characterId: character._id,
            type: "sell",
            status: "open",
          })
          .toArray();
        const alreadyReserved = openSellOrders.reduce(
          (sum, o) => sum + (o.sharesDebitedAtCreation ? 0 : o.sharesRemaining),
          0
        );
        const availableShares = ownedShares - alreadyReserved;
        const terms = positionHoldingTerms(shareholderEntry ?? { shares: 0 }, currentTurn, 0);
        let selectedTerm: HoldingTerm;
        try {
          selectedTerm = chooseHoldingTerm(terms, parsed.data.holdingTerm);
        } catch {
          return errorResponse(409, "Choose Short Term Holdings or Long Term Holdings", {
            extra: { requiresHoldingTerm: true },
          });
        }
        if (availableHoldingShares(terms, selectedTerm) < shares)
          return errorResponse(400, "Insufficient shares in selected holding bucket");
        const holdingChange: PersonalHoldingChange = { turn: currentTurn, term: selectedTerm };

        if (availableShares < shares) {
          return errorResponse(
            400,
            `Only ${availableShares.toLocaleString()} shares available (${alreadyReserved.toLocaleString()} reserved in open orders)`
          );
        }

        // Check if fills immediately (current price >= limit)
        const fillsNow = executionPrice >= pricePerShare && !(await sellExceedsPoolAllowance());

        if (fillsNow) {
          // Immediate fill at current market price
          const proceeds = shareTradeAnchorValue(
            shares,
            { ...corporation, sharePrice: executionPrice },
            targetFxRate
          );
          const proceedsInHome = proceeds * charFxRate;

          const contexts = await loadStockWithholdingContexts(
            db,
            [{ id: character._id, collection: "characters" }],
            currentTurn
          );
          const withholdingContext = contexts.get(
            stockSellerKey({ id: character._id, collection: "characters" })
          );
          if (withholdingContext && withholdingContext.currency !== homeCurrency)
            return errorResponse(409, "Your home currency changed. Refresh before selling shares.");
          const buybackGate = await gateIssuerBuyback();
          if (buybackGate) return buybackGate;

          // Atomically debit shares from seller and increment public float
          const remainingAfterSale = await debitShares(
            db,
            corporation._id,
            character._id,
            shares,
            {
              $inc: {
                publicFloat: shares,
                ...(orderFlowEligible ? { orderFlowWindowSellValue: shares * executionPrice } : {}),
              },
              $set: { updatedAt: now },
            },
            { requireSufficient: true, holdingChange }
          );
          if (remainingAfterSale < 0) {
            await reverseFloatSellDebit(db, corporation, issuerBuyback, {
              split: issuerBuybackSplit,
            });
            return errorResponse(409, "Shares were already sold or reserved by another action");
          }
          const grossStockTax = holdingChange.tracked
            ? pendingStockTaxReceipt({
                id: new ObjectId().toHexString(),
                currencyCode: homeCurrency,
                holdingTerms: holdingChange.taken!,
                proceedsAnchor: proceeds,
                proceedsCredited: proceedsInHome,
                saleTurn: currentTurn,
                assessmentTurn: currentTurn + 1,
              })
            : undefined;
          const stockTax = grossStockTax
            ? withholdStockReceipt(
                grossStockTax,
                contexts.get(stockSellerKey({ id: character._id, collection: "characters" }))
              )
            : undefined;
          let sellerCredited = false;
          try {
            const sellerCredit = await charactersCollection(db).updateOne(
              { _id: character._id },
              {
                $inc: buildPersonalBalanceInc(
                  netStockProceeds(proceedsInHome, stockTax),
                  homeCurrency,
                  forexEnabled
                ),
                $set: { updatedAt: now },
                ...(stockTax ? { $push: { pendingStockTaxReceipts: stockTax } } : {}),
              }
            );
            if (sellerCredit.matchedCount === 0) {
              throw new Error("Seller character not found");
            }
            sellerCredited = true;

            await recordShareTrade(db, {
              corporationId: corporation._id,
              kind: "limit_fill",
              turn: currentTurn,
              shares,
              pricePerShareAnchor: proceeds / shares,
              from: { characterId: character._id, name: character.name },
              to: null,
              corpCurrencyCode: corporation.liquidCurrencyCode,
            });
            await emitTx(db, {
              type: "stock_trade_sell",
              turn: currentTurn,
              createdAt: now,
              subjectType: "character",
              subjectId: character._id,
              subjectName: character.name,
              amount: proceedsInHome,
              currencyCode: homeCurrency,
              counterpartyType: "corporation",
              counterpartyId: corporation._id,
              counterpartyName: corporation.name,
              meta: {
                ...(stockTax ? { stockTax } : {}),
                holdingTerm: selectedTerm,
                corporationId: corporation._id.toString(),
                shares,
                pricePerShare: executionPrice,
                source: "limit_order_immediate_fill",
              },
            });
          } catch (err) {
            if (sellerCredited) {
              await charactersCollection(db).updateOne(
                { _id: character._id },
                {
                  $inc: buildPersonalBalanceInc(
                    -netStockProceeds(proceedsInHome, stockTax),
                    homeCurrency,
                    forexEnabled
                  ),
                  $set: { updatedAt: new Date() },
                  ...(stockTax ? { $pull: { pendingStockTaxReceipts: { id: stockTax.id } } } : {}),
                }
              );
            }
            await creditShares(
              db,
              corporation._id,
              character._id,
              shares,
              {
                $inc: {
                  publicFloat: -shares,
                  ...(orderFlowEligible
                    ? { orderFlowWindowSellValue: -(shares * executionPrice) }
                    : {}),
                },
                $set: { updatedAt: new Date() },
              },
              { holdingChange: { turn: currentTurn, restore: holdingChange.taken } }
            );
            await reverseFloatSellDebit(db, corporation, issuerBuyback, {
              split: issuerBuybackSplit,
            });
            throw err;
          }

          // Sell-fill committed (character): back out realized issuance proceeds to
          // match the float shrinking (mirrors the buy-side credit). Best-effort/terminal.
          await onFloatSellCommitted(db, corporation, issuerBuyback);
          await afterCommit(db, async () => {
            recordAudit({
              source: "api",
              action: "share.order",
              category: "market",
              subject: { type: "corporation", id: corporation._id, name: corporation.name },
              counterparty: { type: "character", id: character._id, name: character.name },
              amount: proceedsInHome,
              currencyCode: homeCurrency,
              refs: { corporationId: corporation._id },
              delta: [
                { field: "orderType", before: null, after: "sell" },
                { field: "status", before: null, after: "filled" },
                { field: "shares", before: null, after: shares },
                { field: "pricePerShare", before: null, after: executionPrice },
              ],
              outcome: "ok",
            });
          });
          return NextResponse.json({
            success: true,
            filled: true,
            sharesSold: shares,
            proceeds: Math.round(proceeds * 100) / 100,
            ...stockSaleDeductions(proceeds, proceedsInHome, stockTax),
          });
        }

        // Pending sell: debit holdings now and set sharesDebitedAtCreation so
        // fill does not debit again. Cancel restores the shares.
        const reservedShares = await debitShares(
          db,
          corporation._id,
          character._id,
          shares,
          { $set: { updatedAt: now } },
          { requireSufficient: true, holdingChange }
        );
        if (reservedShares < 0) {
          return errorResponse(409, "Shares were already sold or reserved by another action");
        }
        try {
          await shareOrdersCollection(db).insertOne({
            _id: new ObjectId(),
            corporationId: corporation._id,
            characterId: character._id,
            type: "sell",
            shares,
            sharesRemaining: shares,
            sharesDebitedAtCreation: true,
            holdingTerms: holdingChange.taken,
            pricePerShare,
            escrowAmount: 0,
            status: "open",
            createdAt: now,
            updatedAt: now,
          });
        } catch (error) {
          await creditShares(
            db,
            corporation._id,
            character._id,
            shares,
            { $set: { updatedAt: new Date() } },
            { holdingChange: { turn: currentTurn, restore: holdingChange.taken } }
          );
          throw error;
        }

        await afterCommit(db, async () => {
          recordAudit({
            source: "api",
            action: "share.order",
            category: "market",
            subject: { type: "corporation", id: corporation._id, name: corporation.name },
            counterparty: { type: "character", id: character._id, name: character.name },
            refs: { corporationId: corporation._id },
            delta: [
              { field: "orderType", before: null, after: "sell" },
              { field: "status", before: null, after: "open" },
              { field: "shares", before: null, after: shares },
              { field: "pricePerShare", before: null, after: pricePerShare },
            ],
            outcome: "ok",
          });
        });
        return NextResponse.json({ success: true, filled: false, sharesReserved: shares });
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
