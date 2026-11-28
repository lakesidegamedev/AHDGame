import { withSessionDb } from "@/lib/db/sessionDb";
import * as Sentry from "@sentry/nextjs";
import { euroLedgerCrossRate, type EuroMonetaryUnion } from "@/lib/currency/euro/rules";
import type { AnyBulkWriteOperation, Db, ObjectId } from "mongodb";

import type { TradeHistoryEntry } from "@/lib/db/types/tradeHistory";
import type { Character } from "@/lib/db/types/character";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  LIMIT_ORDER_SPREAD,
  SPREAD_FEE_CENTRAL_BANK_RATIO,
  SPREAD_FEE_RESERVE_RATIO,
  CURRENCY_SYMBOLS,
} from "@/lib/constants/currencies";
import { playerTradeFeeRate, recentVolumeAnchorOf } from "@/lib/currency/tradeFees";
import { loadTraderRecentForexAnchor } from "@/lib/currency/traderForexVolume";
import { buildPersonalBalanceInc } from "@/lib/currency/characterFunds";
import { recoverStaleFillClaims } from "@/lib/forex/fillRecovery";
import { sendSystemMail } from "@/lib/mail/systemMail";
import { getBankId } from "@/lib/centralBank/helpers";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { currencyOrdersCollection } from "@/lib/db/repositories/currencyOrders";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";
import { tradeHistoryCollection } from "@/lib/db/repositories/tradeHistory";

// ── Limit order processing ──────────────────────────────────────────────────

interface FilledOrderNotification {
  characterId: ObjectId;
  characterName: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  spentAmount: number;
  receivedAmount: number;
  filledRate: number;
}

interface LimitOrderResult {
  ordersFilled: number;
  totalSpreadRevenue: number;
  notifications: FilledOrderNotification[];
}

/**
 * Scan open limit orders and fill any whose limit price is met by the
 * current exchange rate. Executes against the market maker at the
 * prevailing rate. Priority: FIFO (oldest order first).
 *
 * Spread revenue is split: 50% destroyed, 50% to central bank.
 *
 * Each market-maker fill commits its wallet, bank fees, history and order together.
 */
export async function processTriggeredLimitOrders(
  db: Db,
  currentTurn: number,
  now: Date,
  union?: EuroMonetaryUnion
): Promise<LimitOrderResult> {
  // Legacy processing rows without an intent cannot prove whether cash landed.
  // Keep their escrow claim intact instead of reopening a potentially paid fill.
  await recoverStaleFillClaims(db, now);

  // Load current rates into a map for quick lookup
  const rates = await exchangeRatesCollection(db).find({}).toArray();
  const rateMap = new Map(rates.map((r) => [r.currencyCode, r.rate]));

  // Find open/partial limit orders, sorted by creation date (FIFO)
  const openOrders = await currencyOrdersCollection(db)
    .find({
      type: "limit",
      status: { $in: ["open", "partial"] },
    })
    .sort({ createdAt: 1 })
    .toArray();

  let ordersFilled = 0;
  let totalSpreadRevenue = 0;
  const notifications: FilledOrderNotification[] = [];

  for (const candidate of openOrders) {
    try {
      const filled = await withSessionDb(db, async (db) => {
        const order = await currencyOrdersCollection(db).findOne({
          _id: candidate._id,
          status: { $in: ["open", "partial"] },
          processingFillKey: { $exists: false },
        });
        if (
          !order ||
          !Number.isFinite(order.amount) ||
          !Number.isFinite(order.filledAmount) ||
          order.amount <= 0 ||
          order.filledAmount < 0 ||
          order.filledAmount > order.amount
        )
          return null;
        const recipient = await charactersCollection(db).findOne(
          { _id: order.characterId },
          { projection: { _id: 1 } }
        );
        if (!recipient) return null;

        if (
          order.limitRate === undefined ||
          !Number.isFinite(order.limitRate) ||
          order.limitRate <= 0
        )
          return null;

        const fromRate = rateMap.get(order.fromCurrency);
        const toRate = rateMap.get(order.toCurrency);

        // Cross rate: how many toCurrency units per 1 fromCurrency unit
        // Both rates are "local currency per 1 internal unit"
        // crossRate = toRate / fromRate
        const fixedRate = euroLedgerCrossRate(union, order.fromCurrency, order.toCurrency);
        if (
          fixedRate == null &&
          (!fromRate ||
            !toRate ||
            !Number.isFinite(fromRate) ||
            !Number.isFinite(toRate) ||
            fromRate <= 0 ||
            toRate <= 0)
        )
          return null;
        const crossRate = fixedRate ?? toRate! / fromRate!;

        // If the rate is malformed this turn (e.g. a NaN cascade upstream), skip
        // the order rather than filling at Infinity/NaN and poisoning the
        // destination balance via $inc. It re-evaluates next turn.
        if (!Number.isFinite(crossRate) || crossRate <= 0) return null;

        // Buy: fill when cross rate >= limit (player gets at least as much toCurrency as expected)
        // Sell: fill when cross rate <= limit (player gets at least as much fromCurrency as expected)
        const isBuy = order.direction !== "sell";
        const isFillable = isBuy ? crossRate >= order.limitRate : crossRate <= order.limitRate;

        if (!isFillable) return null;

        const remainingAmount = order.amount - order.filledAmount;
        if (
          remainingAmount <= 0 ||
          (fixedRate != null && Math.floor(remainingAmount * crossRate) <= 0)
        )
          return null;

        // ── Atomic claim: open/partial → processing ───────────────────────────
        // This is the idempotency guard. If the process crashes after this point
        // the order stays in "processing", not "open", and will not be replayed.
        const claimResult = await currencyOrdersCollection(db).updateOne(
          {
            _id: order._id,
            status: { $in: ["open", "partial"] },
            filledAmount: order.filledAmount,
            processingFillKey: { $exists: false },
          },
          { $set: { status: "processing" as const, updatedAt: now } }
        );
        if (claimResult.modifiedCount === 0) {
          // Another process already claimed it (or it was cancelled/expired concurrently).
          return null;
        }

        // Calculate spread on the remaining fill. A limit order is a player's own
        // trade, so on top of the cheaper limit spread it pays the same size and
        // liquidity fee as an instant trade; otherwise it would be the way around it.
        const fillAnchor =
          fixedRate == null && fromRate! > 0 ? remainingAmount / fromRate! : undefined;
        const limitFeeRate =
          fillAnchor === undefined
            ? 0
            : playerTradeFeeRate({
                baseSpread: LIMIT_ORDER_SPREAD,
                tradeAnchor: fillAnchor,
                priorAnchor: await loadTraderRecentForexAnchor(db, order.characterId, currentTurn),
                fromVolumeAnchor: recentVolumeAnchorOf(
                  rates.find((r) => r.currencyCode === order.fromCurrency)
                ),
                toVolumeAnchor: recentVolumeAnchorOf(
                  rates.find((r) => r.currencyCode === order.toCurrency)
                ),
              });
        const spreadAmount = fixedRate == null ? remainingAmount * limitFeeRate : 0;
        const netAmount = remainingAmount - spreadAmount;
        const centralBankShare = spreadAmount * SPREAD_FEE_CENTRAL_BANK_RATIO;

        // Convert net fromCurrency to toCurrency at current cross rate
        const toAmount =
          fixedRate == null ? netAmount * crossRate : Math.floor(netAmount * crossRate);
        if (
          !Number.isFinite(spreadAmount) ||
          spreadAmount < 0 ||
          !Number.isFinite(toAmount) ||
          toAmount <= 0 ||
          !Number.isFinite(netAmount) ||
          netAmount <= 0
        )
          throw new Error("Invalid FX fill quote");

        // Split the central bank share per the SPREAD_FEE_*_RATIO constants.
        // forexRevenue (home revenue) stays with the fromCurrency country's CB. The
        // reserve slice stays denominated in the collected fromCurrency but accrues
        // to the *destination* (toCurrency) country's CB as a foreign reserve in the
        // outflow currency — mirroring distributeSpreadFee's cross-currency routing.
        // Use getBankId so shared-bank countries route to the correct bank document.
        const fromCountryEntry = rates.find((r) => r.currencyCode === order.fromCurrency);
        if (fromCountryEntry && spreadAmount > 0) {
          const toReserveBalance = Math.floor(spreadAmount * SPREAD_FEE_RESERVE_RATIO);
          const toForexRevenue = centralBankShare - toReserveBalance;
          const fromBankId = getBankId(
            fromCountryEntry.countryId as Parameters<typeof getBankId>[0]
          );
          const toCountryEntry = rates.find((r) => r.currencyCode === order.toCurrency);
          const reserveBankId = toCountryEntry
            ? getBankId(toCountryEntry.countryId as Parameters<typeof getBankId>[0])
            : fromBankId;
          const banks = centralBanksCollection(db);
          if (reserveBankId === fromBankId) {
            await banks.updateOne(
              { _id: fromBankId },
              {
                $inc: {
                  forexRevenue: toForexRevenue,
                  [`spreadFeeReserveBalances.${order.fromCurrency}`]: toReserveBalance,
                } as Record<string, number>,
              },
              { upsert: true }
            );
          } else {
            await Promise.all([
              banks.updateOne(
                { _id: fromBankId },
                { $inc: { forexRevenue: toForexRevenue } as Record<string, number> },
                { upsert: true }
              ),
              toReserveBalance > 0
                ? banks.updateOne(
                    { _id: reserveBankId },
                    {
                      $inc: {
                        [`spreadFeeReserveBalances.${order.fromCurrency}`]: toReserveBalance,
                      } as Record<string, number>,
                    },
                    { upsert: true }
                  )
                : Promise.resolve(),
            ]);
          }
        }

        // Credit the purchased toCurrency to the character's personal balance.
        // The fromCurrency was escrowed at order creation time — no deduction needed here.
        const creditInc = buildPersonalBalanceInc(toAmount, order.toCurrency, true);
        const creditResult = await charactersCollection(db).updateOne(
          { _id: order.characterId },
          { $inc: creditInc }
        );

        if (creditResult.matchedCount !== 1) throw new Error("FX fill recipient disappeared");

        // forexEnabled is always true here — this phase only runs inside the gameState.forexEnabled gate
        // Record trade history entry
        await tradeHistoryCollection(db).insertOne({
          buyerCharacterId: order.characterId,
          sellerCharacterId: null, // market maker
          fromCurrency: order.fromCurrency,
          toCurrency: order.toCurrency,
          amount: netAmount,
          rate: crossRate,
          spread: spreadAmount,
          ...(fillAnchor !== undefined ? { anchorAmount: fillAnchor } : {}),
          turn: currentTurn,
          createdAt: now,
          source: "limit_order",
        } as TradeHistoryEntry);

        // Update order to its terminal status (filled or partial)
        const newFilledAmount = order.filledAmount + remainingAmount;
        const newStatus = newFilledAmount >= order.amount ? "filled" : "partial";

        const completed = await currencyOrdersCollection(db).updateOne(
          { _id: order._id, status: "processing", filledAmount: order.filledAmount },
          {
            $set: {
              status: newStatus,
              filledAmount: newFilledAmount,
              filledRate: crossRate,
              updatedAt: now,
            },
            $inc: { spreadCharged: spreadAmount },
          }
        );

        if (completed.matchedCount !== 1) throw new Error("FX fill completion changed");
        return {
          spreadRevenue: centralBankShare,
          notification: {
            characterId: order.characterId,
            characterName: order.characterName,
            fromCurrency: order.fromCurrency,
            toCurrency: order.toCurrency,
            spentAmount: remainingAmount,
            receivedAmount: toAmount,
            filledRate: crossRate,
          },
        };
      });
      if (filled) {
        notifications.push(filled.notification);
        ordersFilled++;
        totalSpreadRevenue += filled.spreadRevenue;
      }
    } catch (error) {
      Sentry.captureException(error, {
        extra: { phase: "forexLimitOrders", orderId: String(candidate._id), turn: currentTurn },
      });
    }
  }

  return { ordersFilled, totalSpreadRevenue, notifications };
}

/**
 * Expiry claims retain a refund marker until the wallet write completes.
 * Stamped credits make an interrupted batch safe to retry on the next turn.
 */
export async function expireStaleOrders(db: Db, currentTurn: number, now: Date): Promise<number> {
  const orders = currencyOrdersCollection(db);
  const transitioned = await orders.updateMany(
    { status: { $in: ["open", "partial"] }, expiresAtTurn: { $lte: currentTurn } },
    { $set: { status: "expired", expiryRefundState: "pending", updatedAt: now } }
  );
  const candidates = await orders
    .find(
      { status: "expired", expiryRefundState: { $in: ["pending", "credited"] } },
      { projection: { _id: 1 } }
    )
    .toArray();
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const ids = candidates.slice(offset, offset + 100).map((order) => order._id);
    await withSessionDb(db, async (db) => {
      const pending = await currencyOrdersCollection(db)
        .find(
          {
            _id: { $in: ids },
            status: "expired",
            expiryRefundState: { $in: ["pending", "credited"] },
          },
          {
            projection: {
              characterId: 1,
              fromCurrency: 1,
              amount: 1,
              filledAmount: 1,
              expiryRefundState: 1,
            },
          }
        )
        .toArray();
      const owners = await charactersCollection(db)
        .find(
          { _id: { $in: pending.map((order) => order.characterId) } },
          { projection: { forexExpiryRefunds: 1 } }
        )
        .toArray();
      const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));
      const refunds: AnyBulkWriteOperation<Character>[] = [],
        cleanup: AnyBulkWriteOperation<Character>[] = [];
      const completed: ObjectId[] = [];
      for (const order of pending) {
        const amount = order.amount - order.filledAmount;
        if (
          !Number.isFinite(amount) ||
          amount < 0 ||
          !Number.isFinite(order.filledAmount) ||
          order.filledAmount < 0
        )
          continue;
        const owner = ownerById.get(String(order.characterId));
        if (amount > 0 && !owner) continue;
        const stamp = `forex-expiry:${String(order._id)}#refund`;
        const stamped = owner?.forexExpiryRefunds?.includes(stamp);
        // A credited marker without its wallet proof needs reconciliation, not another payment.
        if (amount > 0 && order.expiryRefundState === "credited" && !stamped) continue;
        if (amount > 0 && !stamped) {
          refunds.push({
            updateOne: {
              filter: { _id: order.characterId, forexExpiryRefunds: { $ne: stamp } },
              update: {
                $inc: buildPersonalBalanceInc(amount, order.fromCurrency, true),
                $addToSet: { forexExpiryRefunds: stamp },
              },
            },
          });
        }
        completed.push(order._id);
        if (owner)
          cleanup.push({
            updateOne: {
              filter: { _id: owner._id },
              update: { $pull: { forexExpiryRefunds: stamp } },
            },
          });
      }
      if (refunds.length) {
        const credited = await charactersCollection(db).bulkWrite(refunds);
        if (credited.matchedCount !== refunds.length)
          throw new Error("FX expiry recipient changed");
      }
      if (completed.length) {
        await currencyOrdersCollection(db).updateMany(
          {
            _id: { $in: completed },
            status: "expired",
            expiryRefundState: { $in: ["pending", "credited"] },
          },
          { $unset: { expiryRefundState: "" } }
        );
        if (cleanup.length) await charactersCollection(db).bulkWrite(cleanup);
      }
    });
  }
  return transitioned.modifiedCount;
}

/**
 * Send in-game mail to each character whose limit order filled this turn.
 * Batches the character lookup — one query for all unique characterIds.
 */
export async function sendFillNotifications(
  db: Db,
  notifications: FilledOrderNotification[]
): Promise<void> {
  if (notifications.length === 0) return;

  const uniqueOids = notifications
    .filter(
      (n, i, arr) =>
        arr.findIndex((x) => x.characterId.toString() === n.characterId.toString()) === i
    )
    .map((n) => n.characterId);

  const chars = await (
    await getCharactersCollection(db)
  )
    .find(
      { _id: { $in: uniqueOids } },
      { projection: { _id: 1, userId: 1, name: 1, sequentialId: 1 } }
    )
    .toArray();

  const charMap = new Map(chars.map((c) => [c._id.toString(), c]));

  for (const note of notifications) {
    const char = charMap.get(note.characterId.toString());
    if (!char) continue;

    const fromSym = CURRENCY_SYMBOLS[note.fromCurrency] ?? note.fromCurrency;
    const toSym = CURRENCY_SYMBOLS[note.toCurrency] ?? note.toCurrency;
    const rate = note.filledRate.toFixed(4);
    const spent = note.spentAmount.toLocaleString("en-US", { maximumFractionDigits: 2 });
    const received = note.receivedAmount.toLocaleString("en-US", { maximumFractionDigits: 2 });

    await sendSystemMail(db, {
      toCharacterId: char._id,
      toCharacterName: char.name,
      toCharacterSequentialId: char.sequentialId ?? 0,
      toUserId: char.userId,
      subject: "Limit Order Filled",
      body: `Your limit order to exchange ${fromSym}${spent} ${note.fromCurrency} → ${note.toCurrency} has filled at a rate of ${rate}. You received ${toSym}${received} ${note.toCurrency}.`,
    });
  }
}
