/**
 * Live money flows around a funded producer turn (funded-market cutover,
 * phase B slice S3b). Each flow is one idempotent money move with a stable key
 * per world, turn and party, so a retried turn never pays twice.
 *
 * - Public funding: the commodity outlay the treasury already spends each
 *   turn (each budget line times its commodity demand rate). That outlay is deducted from the
 *   treasury today and goes nowhere; here the same amount is minted into the
 *   country's public-buyer wallet as its destination. Unspent funding is
 *   burned at close, so public buyers never accumulate cash.
 * - Construction funding: this turn's work on outstanding build orders, whose
 *   cost was paid into a sink when each order was placed. Minted into the
 *   country's construction-buyer wallet and burned at close if unspent.
 * - Household opening: the one-time owner-approved seed (about 3 turns of
 *   wages), minted once per world.
 * - Close: AI profit distribution and operating-payee income move to
 *   households; state-company remittances move to their treasury.
 *
 * Pure: plain data in, money-move descriptions out.
 */
import type { MoneyMove } from "@/lib/banking/moneyMove";
import { ZOD_CURRENCY_ENUM } from "@/lib/constants/currencies";
import { accountId, mintSinkAccount } from "@/lib/ledger/accounts";
import type { LedgerLeg } from "@/lib/ledger/types";

export const PRODUCER_ACCOUNTS = "producerEconomyAccounts";

export interface WalletAmount {
  walletId: string;
  /** Native currency of the wallet. */
  amountLocal: number;
  currencyCode: string;
  localPerAnchor: number;
}

const valuation = (w: WalletAmount) => ({
  currencyCode: w.currencyCode,
  localPerAnchor: w.localPerAnchor,
});

function positive(x: number): number {
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/** Mints each public buyer's funding for this turn. */
export function publicFundingMoves(
  worldEpoch: string,
  turn: number,
  rows: readonly (WalletAmount & { countryId: string })[]
): MoneyMove[] {
  return rows
    .filter((r) => positive(r.amountLocal) > 0)
    .map((r) => ({
      key: `producer-public-funding:${worldEpoch}:${turn}:${r.countryId}`,
      kind: "producer_public_funding",
      turn,
      legs: [
        {
          kind: "mint",
          amount: r.amountLocal,
          valuation: valuation(r),
          note: "commodity share of the budget outlay the treasury already spent",
        },
        {
          kind: "credit",
          amount: r.amountLocal,
          valuation: valuation(r),
          collection: PRODUCER_ACCOUNTS,
          filter: { _id: r.walletId },
          path: "cash",
          note: "public buyer funding",
        },
      ],
    }));
}

/** Burns what a public buyer did not spend. */
export function publicReturnMoves(
  worldEpoch: string,
  turn: number,
  rows: readonly (WalletAmount & { countryId: string })[]
): MoneyMove[] {
  return rows
    .filter((r) => positive(r.amountLocal) > 0)
    .map((r) => ({
      key: `producer-public-return:${worldEpoch}:${turn}:${r.countryId}`,
      kind: "producer_public_return",
      turn,
      legs: [
        {
          kind: "debit",
          amount: r.amountLocal,
          valuation: valuation(r),
          collection: PRODUCER_ACCOUNTS,
          filter: { _id: r.walletId },
          path: "cash",
          note: "unspent public funding",
        },
        {
          kind: "burn",
          amount: r.amountLocal,
          valuation: valuation(r),
          note: "unspent public funding returns to the budget",
        },
      ],
    }));
}

/** Mints each construction buyer's funding: the turn's work on already-paid build orders. */
export function investmentFundingMoves(
  worldEpoch: string,
  turn: number,
  rows: readonly (WalletAmount & { countryId: string })[]
): MoneyMove[] {
  return rows
    .filter((r) => positive(r.amountLocal) > 0)
    .map((r) => ({
      key: `producer-investment-funding:${worldEpoch}:${turn}:${r.countryId}`,
      kind: "producer_investment_funding",
      turn,
      legs: [
        {
          kind: "mint",
          amount: r.amountLocal,
          valuation: valuation(r),
          note: "construction work on build orders already paid into the capex sink",
        },
        {
          kind: "credit",
          amount: r.amountLocal,
          valuation: valuation(r),
          collection: PRODUCER_ACCOUNTS,
          filter: { _id: r.walletId },
          path: "cash",
          note: "construction buyer funding",
        },
      ],
    }));
}

/** Burns construction work no producer could supply this turn. */
export function investmentReturnMoves(
  worldEpoch: string,
  turn: number,
  rows: readonly (WalletAmount & { countryId: string })[]
): MoneyMove[] {
  return rows
    .filter((r) => positive(r.amountLocal) > 0)
    .map((r) => ({
      key: `producer-investment-return:${worldEpoch}:${turn}:${r.countryId}`,
      kind: "producer_investment_return",
      turn,
      legs: [
        {
          kind: "debit",
          amount: r.amountLocal,
          valuation: valuation(r),
          collection: PRODUCER_ACCOUNTS,
          filter: { _id: r.walletId },
          path: "cash",
          note: "unbought construction work",
        },
        {
          kind: "burn",
          amount: r.amountLocal,
          valuation: valuation(r),
          note: "unbought construction work stays in the capex sink",
        },
      ],
    }));
}

/** One-time household opening seed, keyed per world so it can only land once. */
export function householdOpeningMoves(
  worldEpoch: string,
  approvalReference: string,
  rows: readonly WalletAmount[]
): MoneyMove[] {
  if (!approvalReference.trim())
    throw new Error("Household opening cash requires an owner approval reference");
  return rows
    .filter((r) => positive(r.amountLocal) > 0)
    .map((r) => ({
      key: `producer-household-opening:${worldEpoch}:${r.walletId}`,
      kind: "producer_household_opening",
      record: { approvalReference },
      legs: [
        {
          kind: "mint",
          amount: r.amountLocal,
          valuation: valuation(r),
          note: `household opening cash (${approvalReference})`,
        },
        {
          kind: "credit",
          amount: r.amountLocal,
          valuation: valuation(r),
          collection: PRODUCER_ACCOUNTS,
          filter: { _id: r.walletId },
          path: "cash",
          note: "household opening cash",
        },
      ],
    }));
}

export interface CloseParty {
  collection: string;
  filter: Record<string, unknown>;
  path: string;
  id: string;
  currencyCode: string;
  localPerAnchor: number;
}

export interface CloseTransfer {
  reason: "ai_dividend" | "operating_income" | "state_remittance";
  from: CloseParty;
  to: CloseParty;
  /** Anchor value; each side is booked in its own currency at its own rate. */
  amountAnchor: number;
}

/** End-of-turn transfers, one move per source and reason. */
export function closeTransferMoves(
  worldEpoch: string,
  turn: number,
  transfers: readonly CloseTransfer[]
): MoneyMove[] {
  return transfers
    .filter(
      (t) => positive(t.amountAnchor) > 0 && t.from.localPerAnchor > 0 && t.to.localPerAnchor > 0
    )
    .map((t) => ({
      key: `producer-close:${worldEpoch}:${turn}:${t.reason}:${t.from.id}`,
      kind: `producer_${t.reason}`,
      turn,
      legs: [t.from, t.to].map((side, i) => ({
        kind: i === 0 ? ("debit" as const) : ("credit" as const),
        amount: t.amountAnchor * side.localPerAnchor,
        valuation: { currencyCode: side.currencyCode, localPerAnchor: side.localPerAnchor },
        collection: side.collection,
        filter: side.filter,
        path: side.path,
        note: t.reason,
      })),
    }));
}

/** Transition floor payments: unspent public funding to an over-built sector's owner. */
export function transitionSupportMoves(
  worldEpoch: string,
  turn: number,
  payments: readonly { payeeKey: string; amountAnchor: number; from: CloseParty; to: CloseParty }[]
): MoneyMove[] {
  return payments
    .filter(
      (p) => positive(p.amountAnchor) > 0 && p.from.localPerAnchor > 0 && p.to.localPerAnchor > 0
    )
    .map((p) => ({
      key: `producer-transition:${worldEpoch}:${turn}:${p.payeeKey}`,
      kind: "producer_transition_support",
      turn,
      legs: [p.from, p.to].map((side, i) => ({
        kind: i === 0 ? ("debit" as const) : ("credit" as const),
        amount: p.amountAnchor * side.localPerAnchor,
        valuation: { currencyCode: side.currencyCode, localPerAnchor: side.localPerAnchor },
        collection: side.collection,
        filter: side.filter,
        path: side.path,
        note: "transition revenue floor",
      })),
    }));
}

/**
 * Ledger legs witnessing one applied producer money move, so the ledger
 * reconciler sees the funded market's transfers, mints and burns beside the
 * settlement it already witnesses. Mints draw from and burns pay into a named
 * account per move kind, so every entry balances. Null when a leg cannot be
 * named (unknown collection or currency).
 */
export function producerMoveLedgerLegs(move: MoneyMove): LedgerLeg[] | null {
  const legs: LedgerLeg[] = [];
  for (const leg of move.legs) {
    if (!(leg.amount > 0)) continue;
    const currency = ZOD_CURRENCY_ENUM.find((c) => c === leg.valuation?.currencyCode);
    const rate = leg.valuation?.localPerAnchor;
    if (!currency || !rate || !(rate > 0)) return null;
    const anchor = leg.amount / rate;
    if (leg.kind === "mint" || leg.kind === "burn") {
      const sign = leg.kind === "mint" ? -1 : 1;
      legs.push({
        account: mintSinkAccount(leg.kind === "mint" ? 1 : -1, move.kind, currency),
        amount: sign * leg.amount,
        currencyCode: currency,
        anchorAmount: sign * anchor,
        role: "primary",
      });
      continue;
    }
    const kind =
      leg.collection === "corporations"
        ? "corporation"
        : leg.collection === PRODUCER_ACCOUNTS
          ? "economy_wallet"
          : null;
    const ref = leg.filter?._id;
    if (!kind || ref == null) return null;
    const sign = leg.kind === "debit" ? -1 : 1;
    legs.push({
      account: accountId(kind, String(ref), currency),
      amount: sign * leg.amount,
      currencyCode: currency,
      anchorAmount: sign * anchor,
      role: "primary",
    });
  }
  return legs.length >= 2 ? legs : null;
}
