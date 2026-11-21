import type { RouteParams } from "@/lib/corporations/commands/shareTrading/placeShareOrder";

import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";
import { requireCorporationActionsEnabled } from "@/lib/api/requireCorporationActions";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { placeOrderSchema } from "@/lib/api/schemas/corporations";
import { errorResponse } from "@/lib/api/errors";
import { resolveCorporation } from "@/lib/api/corporations/resolveQuery";
import { assertCeoTradeNotBlocked } from "@/lib/corporations/commands/privatization/openVoteGuard";

import { getCharacterByUserId } from "@/lib/db/characterLookup";

import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { newCharacterTransferBarrierResponse } from "@/lib/api/newCharacterTransferBarrier";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { getHomeCurrency } from "@/lib/currency/characterFunds";

import { getCorpFxRate, resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";

import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { assertCeoAcquisitionWithinCap } from "@/lib/corporations/ceoShareAcquisitionCap";

import {
  settleFloatSellDebit,
  type EscrowDebitSplit,
} from "@/lib/corporations/shareEscrowSettlement";
import { CURRENCY_SYMBOLS } from "@/lib/constants/currencies";

import { loadPoolSellPacing, poolSellPacedMessage } from "@/lib/equities/blockPacing";
import {
  isOrderFlowPriceEligible,
  isWithinShareExecutionBand,
} from "@/lib/corporations/marketExecution";
import { equityPoolDepthMessage, loadEquityQuote } from "@/lib/equities/marketPool";

import { rejectDuringTurn } from "@/lib/api/rejectDuringTurn";

export async function prepareShareOrder(request: Request, { params }: RouteParams) {
  const auth = await requireBasicAuth();
  if (!auth.ok) return { kind: "early" as const, value: auth.response };

  const rateLimit = checkRateLimit(
    `lib/corporations/commands/shareTrading/placeShareOrder:${auth.user.userId}`,
    20,
    60000
  );
  if (!rateLimit.ok)
    return { kind: "early" as const, value: rateLimitResponse(rateLimit.retryAfter) };

  const { id } = await params;
  const parsed = await parseJsonBody(request, placeOrderSchema);
  if (!parsed.success) {
    return { kind: "early" as const, value: errorResponse(parsed.status, parsed.error) };
  }

  const { type, shares, pricePerShare, placeAsCorporation } = parsed.data;
  const db = await getDb();
  const corpGuard = await requireCorporationActionsEnabled(db);
  if (corpGuard) return { kind: "early" as const, value: corpGuard };
  const turnGuard = await rejectDuringTurn(db);
  if (turnGuard) return { kind: "early" as const, value: turnGuard };

  const resolved = await resolveCorporation(db, id);
  if (!resolved.ok) return { kind: "early" as const, value: resolved.response };
  const { corporation } = resolved;

  // Private companies trade through Private sale only. A limit order leaves a
  // resting bid only private holders can see but cannot fill, and the private
  // sale band cannot match an order-book price. Refuse at the source.
  if (corporation.isPrivate === true) {
    return {
      kind: "early" as const,
      value: errorResponse(
        400,
        `${corporation.name} is a private company. Private shares change hands through a private sale, not the order book.`
      ),
    };
  }

  const marketQuote = await loadEquityQuote(db, corporation);
  const executionPrice = type === "buy" ? marketQuote.askPriceLocal : marketQuote.bidPriceLocal;
  const orderFlowEligible = isOrderFlowPriceEligible(
    corporation.publicFloat,
    corporation.totalShares
  );

  // Limit prices must sit inside the fundamental-anchored sanity band.
  // Off-fundamental orders were used for manipulation: fills far from
  // fundamental inflated order-flow notionals at fabricated prices. Honest
  // orders near market price are unaffected. The band only applies when the
  // corp has a positive fundamentalSharePrice.
  if (!isWithinShareExecutionBand(corporation, pricePerShare)) {
    return {
      kind: "early" as const,
      value: errorResponse(
        400,
        `Limit price is too far from ${corporation.name}'s fundamental share price. Place an order closer to the current valuation.`
      ),
    };
  }

  const character = await getCharacterByUserId(db, auth.user.userId);
  if (!character) {
    return { kind: "early" as const, value: errorResponse(404, "Character not found") };
  }
  // Resting orders move value between players at fill time — same
  // disguised-transfer surface the new-character barrier covers elsewhere.
  const barrier = await newCharacterTransferBarrierResponse(character);
  if (barrier) return { kind: "early" as const, value: barrier };
  const tradeLock = await assertCeoTradeNotBlocked(db, corporation, character._id);
  if (tradeLock.blocked) {
    return { kind: "early" as const, value: errorResponse(tradeLock.status, tradeLock.error) };
  }
  const now = new Date();
  const forexEnabled = await isForexEnabled();
  const homeCurrency = getHomeCurrency(character);

  // sharePrice and user-supplied pricePerShare are both denominated in the
  // target corp's liquidCurrencyCode (v0.2.6). Normalize to ₳ here; every
  // cost/proceeds/escrow calculation below reads through this rate.
  const targetFxRate = await getCorpFxRate(db, corporation);
  const currentTurn = await getCurrentTurn(db);

  // CEO self-acquisition cap: a personal buy order by the corp's own CEO counts
  // against the 10%/120-turn window (reserved at placement; open buy orders are
  // tallied by the guard). Corp-placed orders can't trade own shares (blocked below).
  if (!placeAsCorporation && type === "buy") {
    const ceoCap = await assertCeoAcquisitionWithinCap(
      db,
      corporation,
      character._id,
      "characterId",
      shares,
      currentTurn
    );
    if (ceoCap)
      return { kind: "early" as const, value: errorResponse(ceoCap.status, ceoCap.error) };
  }

  // Treasury-backed market maker: an immediate-fill sell into the float is
  // bought back from the ISSUER's own liquidCapital (its local currency),
  // capped at what the treasury holds. Mirrors the market-order sell route so
  // a limit order can't bypass the cap. (Pending orders that don't fill now
  // are filled later peer-to-peer or by the turn processor.)
  const issuerBuyback = shares * executionPrice;
  const issuerCurrency = resolveCorpLiquidCurrencyCode(corporation) ?? "USD";
  // Hoisted so the outer-scope rollback paths can reverse the exact escrow/
  // treasury split recorded when the issuer buyback was settled.
  let issuerBuybackSplit: EscrowDebitSplit | undefined;
  async function gateIssuerBuyback(): Promise<NextResponse | null> {
    if (marketQuote.active && shares > marketQuote.bidDepthShares) {
      return errorResponse(
        400,
        equityPoolDepthMessage(marketQuote.bidDepthShares, marketQuote.currency),
        { extra: { marketDepthShares: marketQuote.bidDepthShares } }
      );
    }
    const settle = await settleFloatSellDebit(db, corporation, issuerBuyback);
    issuerBuybackSplit = settle.split;
    if (settle.paced) {
      const pacedShares =
        executionPrice > 0 ? Math.floor((settle.pacedRemainingLocal ?? 0) / executionPrice) : 0;
      return errorResponse(400, poolSellPacedMessage(pacedShares, corporation.name), {
        extra: { marketPacedShares: pacedShares },
      });
    }
    if (!settle.ok) {
      const sym = CURRENCY_SYMBOLS[issuerCurrency] ?? "$";
      return errorResponse(
        400,
        marketQuote.active
          ? equityPoolDepthMessage(marketQuote.bidDepthShares, marketQuote.currency)
          : `${corporation.name}'s treasury can't cover this sale (needs ${sym}${issuerBuyback.toLocaleString(undefined, { maximumFractionDigits: 0 })}). List the shares for sale to a real buyer instead.`,
        {
          extra: {
            ...(marketQuote.active ? { marketDepthShares: marketQuote.bidDepthShares } : {}),
          },
        }
      );
    }
    return null;
  }

  // A marketable sell larger than this turn's pool allowance for the company
  // rests as an order instead of failing; the turn order book fills it a
  // slice per turn at the market price (blockPacing.ts).
  async function sellExceedsPoolAllowance(): Promise<boolean> {
    if (type !== "sell" || !marketQuote.active) return false;
    const pacing = await loadPoolSellPacing(db, corporation._id);
    return issuerBuyback > pacing.remainingLocal + 0.01;
  }
  return {
    kind: "context" as const,
    context: {
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
    },
  };
}
