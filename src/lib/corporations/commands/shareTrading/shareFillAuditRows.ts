import type { StockTaxReceipt } from "@/lib/budget/rules/capitalGainsTax";
import type { ShareHoldingTerms } from "@/lib/corporations/rules/holdingTerms";

import { ObjectId } from "mongodb";

import { type TxInput } from "@/lib/financialTxLog/emit";
import { type RecordShareTradeInput } from "@/lib/corporations/shareTradeHistory";
import { type ShareFillMoneyPlan } from "@/lib/corporations/commands/shareTrading/shareFillMoney";
import type { IndexFundTransaction } from "@/lib/db/types";

import type { ShareTradeParty } from "@/lib/db/types/shareTradeHistory";
import type { CurrencyCode } from "@/lib/constants/currencies";

/**
 * Durable audit for peer order-book fills.
 *
 * Fill money moves as keyed legs (shareFillMoney.ts): every fill attempt mints
 * one key, stamps it on the order inside the atomic claim write, and persists
 * a resume plan on a money-flow receipt before money moves. This module owns
 * the audit side: all audit rows (financial-tx log, fund-transaction row,
 * trade-history row) insert under deterministic `_id`s derived from the attempt
 * key, so a crash between money and audit is repaired by convergent
 * re-insertion instead of leaving missing audit, and a retry never duplicates
 * rows.
 *
 * Recovery runs money first, audit second: the periodic pass re-drives stranded
 * money receipts from their stored plans, then inserts planned audit rows only
 * after the receipt records `moneyCommitted`. Anything earlier settles
 * `failed` or stays `in_progress` (TTL-visible) for ops instead of guessing.
 */

/** Deterministic-insert domains for one fill attempt's audit rows. */
export const SHARE_FILL_TX_BUY_DOMAIN = "share-fill-tx-buy";

export const SHARE_FILL_TX_SELL_DOMAIN = "share-fill-tx-sell";

export type ShareFillPlacerKind = "character" | "corporation" | "fund";

export type ShareFillFillerCollection = "characters" | "imperialCharacters" | "corporations";

/**
 * Resume plan persisted on the receipt before money moves. Every amount and
 * display name is pinned here at claim time, so recovery rebuilds the exact
 * rows the first attempt owed without re-reading post-fill state. Post-money
 * values that only exist after the debit (`fillerBalanceAfter`) are pinned by
 * `markShareFillMoneyCommitted` in the same write that records the commit.
 */
export interface ShareFillAuditPlan {
  targetKind?: "listing";
  offerIdHex?: string;
  listingMoneyPlan?: ShareFillMoneyPlan;
  buyerRefund?: { amount: number; currency: string };
  claimSnapshot?: {
    escrowAmount: number;
    escrowAnchor?: number;
    holdingTerms?: ShareHoldingTerms;
    previousFillKey?: string;
  };
  sellerHoldingTerms?: ShareHoldingTerms;
  stockTax?: StockTaxReceipt;
  version: 1;
  orderIdHex: string;
  corpIdHex: string;
  corpCcy?: string;
  orderType: "buy" | "sell";
  shares: number;
  pricePerShare: number;
  /** Share value in anchor (total in the corp liquid currency converted). */
  totalAnchor: number;
  turn: number;
  nowIso: string;
  preClaimRemaining: number;
  filler: {
    idHex: string;
    collection: ShareFillFillerCollection;
    name: string;
    homeCurrency: CurrencyCode;
    imperial: boolean;
  };
  /** Filler-side proceeds/cost in the filler's own currency units. */
  fillerAmount: number;
  fillerBalanceAfter?: number;
  placerKind: ShareFillPlacerKind;
  placerIdHex?: string;
  placerName: string;
  /** Seller proceeds (sell fills against a character/corporation placer). */
  sellerAmount?: number;
  sellerCurrency?: CurrencyCode;
  /** Sell fills against a fund placer own a fund-transaction row, no seller tx. */
  fundTx: boolean;
  moneyCommitted: boolean;
}

export function fillerParty(plan: ShareFillAuditPlan): ShareTradeParty {
  const id = new ObjectId(plan.filler.idHex);
  if (plan.filler.collection === "corporations") {
    return { corporationId: id, name: plan.filler.name };
  }
  return plan.filler.imperial
    ? { imperialCharacterId: id, name: plan.filler.name }
    : { characterId: id, name: plan.filler.name };
}

export function placerParty(plan: ShareFillAuditPlan): ShareTradeParty {
  if (plan.placerKind === "fund") return { name: plan.placerName };
  const id = new ObjectId(plan.placerIdHex!);
  if (plan.placerKind === "corporation") {
    return { corporationId: id, name: plan.placerName };
  }
  return { characterId: id, name: plan.placerName };
}

export function counterpartyType(
  kind: ShareFillPlacerKind | "filler-corp" | "filler-char"
): string {
  if (kind === "corporation" || kind === "filler-corp") return "corporation";
  if (kind === "fund") return "system";
  return "character";
}

export function txMeta(plan: ShareFillAuditPlan): Record<string, unknown> {
  return {
    corporationId: plan.corpIdHex,
    orderId: plan.orderIdHex,
    shares: plan.shares,
    pricePerShare: plan.pricePerShare,
    source: plan.orderType === "sell" ? "order_fill_sell_order" : "order_fill_buy_order",
    imperial: plan.filler.imperial || undefined,
  };
}

/** One fill attempt's full audit set, rebuilt identically on first attempt and recovery. */
export interface ShareFillAuditRows {
  txs: TxInput[];
  txDomains: string[];
  fundTx: Omit<IndexFundTransaction, "_id"> | null;
  history: RecordShareTradeInput;
}

export function collectShareFillAuditRows(plan: ShareFillAuditPlan): ShareFillAuditRows {
  const createdAt = new Date(plan.nowIso);
  const txs: TxInput[] = [];
  const txDomains: string[] = [];
  const fillerIsCorp = plan.filler.collection === "corporations";
  const fillerSubjectType = fillerIsCorp ? "corporation" : "character";
  const fillerCounterpartyKind = fillerIsCorp ? "filler-corp" : "filler-char";

  if (plan.orderType === "sell") {
    if (plan.placerKind !== "fund") {
      txs.push({
        type: "stock_trade_sell",
        turn: plan.turn,
        createdAt,
        subjectType: plan.placerKind === "corporation" ? "corporation" : "character",
        subjectId: new ObjectId(plan.placerIdHex!),
        subjectName: plan.placerName,
        amount: plan.sellerAmount!,
        currencyCode: plan.sellerCurrency!,
        counterpartyType: counterpartyType(fillerCounterpartyKind) as TxInput["counterpartyType"],
        counterpartyId: new ObjectId(plan.filler.idHex),
        counterpartyName: plan.filler.name,
        meta: { ...txMeta(plan), ...(plan.stockTax ? { stockTax: plan.stockTax } : {}) },
      });
      txDomains.push(SHARE_FILL_TX_SELL_DOMAIN);
    }
    if (plan.targetKind !== "listing")
      txs.push({
        type: "stock_trade_buy",
        turn: plan.turn,
        createdAt,
        subjectType: fillerSubjectType as TxInput["subjectType"],
        subjectId: new ObjectId(plan.filler.idHex),
        subjectName: plan.filler.name,
        amount: -plan.fillerAmount,
        balanceAfter: plan.fillerBalanceAfter,
        currencyCode: plan.filler.homeCurrency,
        counterpartyType: counterpartyType(plan.placerKind) as TxInput["counterpartyType"],
        counterpartyId: plan.placerKind === "fund" ? undefined : new ObjectId(plan.placerIdHex!),
        counterpartyName: plan.placerName,
        meta: txMeta(plan),
      });
    if (plan.targetKind !== "listing") txDomains.push(SHARE_FILL_TX_BUY_DOMAIN);
  } else {
    txs.push({
      type: "stock_trade_sell",
      turn: plan.turn,
      createdAt,
      subjectType: fillerSubjectType as TxInput["subjectType"],
      subjectId: new ObjectId(plan.filler.idHex),
      subjectName: plan.filler.name,
      amount: plan.fillerAmount,
      currencyCode: plan.filler.homeCurrency,
      counterpartyType: counterpartyType(plan.placerKind) as TxInput["counterpartyType"],
      counterpartyId: plan.placerKind === "fund" ? undefined : new ObjectId(plan.placerIdHex!),
      counterpartyName: plan.placerName,
      meta: { ...txMeta(plan), ...(plan.stockTax ? { stockTax: plan.stockTax } : {}) },
    });
    txDomains.push(SHARE_FILL_TX_SELL_DOMAIN);
  }

  if (plan.targetKind === "listing" && plan.buyerRefund && plan.buyerRefund.amount > 0) {
    txs.push({
      type: "share_listing_refund",
      turn: plan.turn,
      createdAt,
      subjectType: fillerSubjectType as TxInput["subjectType"],
      subjectId: new ObjectId(plan.filler.idHex),
      subjectName: plan.filler.name,
      amount: plan.buyerRefund.amount,
      currencyCode: plan.buyerRefund.currency as CurrencyCode,
      counterpartyType: "system",
      counterpartyName: "Listing escrow",
      meta: txMeta(plan),
    });
    txDomains.push("share-fill-listing-refund");
  }
  const fundTx: Omit<IndexFundTransaction, "_id"> | null =
    plan.orderType === "sell" && plan.fundTx
      ? {
          fundId: new ObjectId(plan.placerIdHex!),
          kind: "liquidity_quote_sell",
          corporationId: new ObjectId(plan.corpIdHex),
          shares: plan.shares,
          amountAnchor: plan.totalAnchor,
          note: "Executable equity liquidity ask filled",
          createdAt,
        }
      : null;

  const from = plan.orderType === "sell" ? placerParty(plan) : fillerParty(plan);
  const to = plan.orderType === "sell" ? fillerParty(plan) : placerParty(plan);
  const history: RecordShareTradeInput = {
    corporationId: new ObjectId(plan.corpIdHex),
    kind: plan.targetKind === "listing" ? "listing_fill" : "peer_fill",
    turn: plan.turn,
    shares: plan.shares,
    pricePerShareAnchor: plan.totalAnchor / plan.shares,
    from,
    to,
    ...(plan.corpCcy ? { corpCurrencyCode: plan.corpCcy as CurrencyCode } : {}),
    createdAt,
  };

  return { txs, txDomains, fundTx, history };
}
