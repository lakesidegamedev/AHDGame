import {
  loadStockWithholdingContexts,
  withholdStockReceipt,
  netStockProceeds,
} from "@/lib/budget/stockSaleWithholding";
import type { Db } from "mongodb";
import { anchorHoldingPosition, positionHoldingTerms } from "@/lib/corporations/rules/holdingTerms";
import { pendingStockTaxReceipt } from "@/lib/corporations/rules/stockTaxReceipt";

import { ObjectId } from "mongodb";

import type { Corporation } from "@/lib/db/types";

import type { CurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { anchorToCorpLiquidCapital, fxRateForCorpFromMap } from "@/lib/currency/corporationCapital";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { buildPersonalBalanceInc, getHomeCurrency } from "@/lib/currency/characterFunds";

import { allocateShareholderPool } from "@/lib/bonds/corporateBondDefault";

import {
  payFundShareholderRows,
  payNppShareholderRows,
} from "@/lib/corporations/payFundShareholders";

import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import type { CountryId } from "@/lib/constants/countries";

import { creditTreasuryProceedsFromAnchor } from "@/lib/nationalization/treasury";
import { type TreasuryCashOptions } from "@/lib/nationalization/treasuryLedger";

import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";

import { imperialCharactersCollection } from "@/lib/db/repositories/imperialCharacters";

export async function payShareholders(
  db: Db,
  target: Corporation,
  poolAnchor: number,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>,
  now: Date,
  ledger?: PayShareholdersLedgerContext
): Promise<void> {
  const allocation = allocateShareholderPool(target, poolAnchor, new Map());
  const forexEnabled = await isForexEnabled();
  // Ledger legs for every holder credited below. Collected here and flushed once
  // at the end so a throw part-way through does not log money that was reversed.
  const ledgerEntries: PayShareholdersTxInput[] = [];
  const holdingsByOwner = new Map(
    (target.shareholders ?? []).flatMap((holder) => {
      const key = holder.characterId
        ? "character:" + holder.characterId.toHexString()
        : holder.imperialCharacterId
          ? "imperial:" + holder.imperialCharacterId.toHexString()
          : undefined;
      return key ? [[key, holder] as const] : [];
    })
  );

  const anchorToLocal = (amtAnchor: number, currency: string): number => {
    const rate = fxByCurrency.get(currency as CurrencyCode);
    return Number.isFinite(rate) && rate && rate > 0 ? amtAnchor * rate : amtAnchor;
  };

  // Character + imperial holders → personal cash, split by collection.
  const charRows = allocation.characterRows.filter((r) => !r.isImperial && r.payout > 0);
  const imperialRows = allocation.characterRows.filter((r) => r.isImperial && r.payout > 0);

  const withholdingContexts = await loadStockWithholdingContexts(
    db,
    [
      ...charRows.map((r) => ({
        id: new ObjectId(r.characterId),
        collection: "characters" as const,
      })),
      ...imperialRows.map((r) => ({
        id: new ObjectId(r.characterId),
        collection: "imperialCharacters" as const,
      })),
    ],
    ledger?.turn ?? 0
  );
  if (charRows.length > 0) {
    const ids = charRows.map((r) => new ObjectId(r.characterId));
    const docs = await charactersCollection(db)
      .find({ _id: { $in: ids } })
      .toArray();
    const currencyById = new Map(docs.map((c) => [c._id.toString(), getHomeCurrency(c)]));
    await charactersCollection(db).bulkWrite(
      charRows.map((r) => {
        const currency = currencyById.get(r.characterId) ?? "USD";
        const amt = forexEnabled ? anchorToLocal(r.payout, currency) : r.payout;
        const holder = holdingsByOwner.get("character:" + r.characterId);
        const grossStockTax =
          ledger?.stockTaxActive && holder
            ? pendingStockTaxReceipt({
                id:
                  target._id.toHexString() +
                  ":" +
                  ledger.kind +
                  ":" +
                  ledger.turn +
                  ":character:" +
                  r.characterId,
                currencyCode: currency,
                holdingTerms: positionHoldingTerms(
                  anchorHoldingPosition(holder, fxRateForCorpFromMap(target, fxByCurrency)),
                  ledger.turn,
                  0
                ),
                proceedsAnchor: r.payout,
                proceedsCredited: amt,
                saleTurn: ledger.turn,
                assessmentTurn: ledger.turn + 1,
              })
            : undefined;
        const stockTax = grossStockTax
          ? withholdStockReceipt(
              grossStockTax,
              withholdingContexts.get("characters:" + r.characterId)
            )
          : undefined;
        if (ledger)
          ledgerEntries.push(
            buyoutPayoutLeg(ledger, target, "character", new ObjectId(r.characterId), amt, currency)
          );
        return {
          updateOne: {
            filter: { _id: new ObjectId(r.characterId) },
            update: {
              $inc: buildPersonalBalanceInc(
                netStockProceeds(amt, stockTax),
                currency,
                forexEnabled
              ),
              $set: { updatedAt: now },
              ...(stockTax ? { $push: { pendingStockTaxReceipts: stockTax } } : {}),
            },
          },
        };
      })
    );
  }

  if (imperialRows.length > 0) {
    const ids = imperialRows.map((r) => new ObjectId(r.characterId));
    const docs = await imperialCharactersCollection(db)
      .find({ _id: { $in: ids } })
      .toArray();
    const currencyById = new Map(docs.map((c) => [c._id.toString(), getHomeCurrency(c)]));
    await imperialCharactersCollection(db).bulkWrite(
      imperialRows.map((r) => {
        const currency = currencyById.get(r.characterId) ?? "USD";
        const amt = forexEnabled ? anchorToLocal(r.payout, currency) : r.payout;
        const holder = holdingsByOwner.get("imperial:" + r.characterId);
        const grossStockTax =
          ledger?.stockTaxActive && holder
            ? pendingStockTaxReceipt({
                id:
                  target._id.toHexString() +
                  ":" +
                  ledger.kind +
                  ":" +
                  ledger.turn +
                  ":imperial:" +
                  r.characterId,
                currencyCode: currency,
                holdingTerms: positionHoldingTerms(
                  anchorHoldingPosition(holder, fxRateForCorpFromMap(target, fxByCurrency)),
                  ledger.turn,
                  0
                ),
                proceedsAnchor: r.payout,
                proceedsCredited: amt,
                saleTurn: ledger.turn,
                assessmentTurn: ledger.turn + 1,
              })
            : undefined;
        const stockTax = grossStockTax
          ? withholdStockReceipt(
              grossStockTax,
              withholdingContexts.get("imperialCharacters:" + r.characterId)
            )
          : undefined;
        if (ledger)
          ledgerEntries.push(
            buyoutPayoutLeg(
              ledger,
              target,
              "character",
              new ObjectId(r.characterId),
              amt,
              currency,
              {
                imperial: true,
              }
            )
          );
        return {
          updateOne: {
            filter: { _id: new ObjectId(r.characterId) },
            update: {
              $inc: buildPersonalBalanceInc(
                netStockProceeds(amt, stockTax),
                currency,
                forexEnabled
              ),
              $set: { updatedAt: now },
              ...(stockTax ? { $push: { pendingStockTaxReceipts: stockTax } } : {}),
            },
          },
        };
      })
    );
  }

  // Corporate equity holders → liquidCapital, in each corp's home currency.
  const corpRows = allocation.corporationRows.filter((r) => r.payout > 0);
  if (corpRows.length > 0) {
    const ids = corpRows.map((r) => new ObjectId(r.corporationId));
    const docs = await corporationsCollection(db)
      .find({ _id: { $in: ids } })
      .toArray();
    const corpById = new Map(docs.map((c) => [c._id.toString(), c]));
    await corporationsCollection(db).bulkWrite(
      corpRows.map((r) => {
        const creditor = corpById.get(r.corporationId);
        const creditorCurrency = (creditor?.liquidCurrencyCode ??
          COUNTRY_CURRENCY_MAP[creditor?.countryId as CountryId] ??
          "USD") as CurrencyCode;
        const rate = fxByCurrency.get(creditorCurrency) ?? 1;
        const amtInCapital = Math.round(anchorToCorpLiquidCapital(r.payout, creditor ?? {}, rate));
        if (ledger)
          ledgerEntries.push(
            buyoutPayoutLeg(
              ledger,
              target,
              "corporation",
              new ObjectId(r.corporationId),
              amtInCapital,
              creditorCurrency
            )
          );
        return {
          updateOne: {
            filter: { _id: new ObjectId(r.corporationId) },
            update: { $inc: { liquidCapital: amtInCapital }, $set: { updatedAt: now } },
          },
        };
      })
    );
  }

  // Public float → the national treasury (no value dropped). Same unified
  // treasury the rest of the nationalization money flows move (spec §5).
  if (allocation.publicFloatRow && allocation.publicFloatRow.payout > 0) {
    // The treasury leg settles against the seized corporation like the holder rows.
    await creditTreasuryProceedsFromAnchor(
      db,
      target.countryId,
      allocation.publicFloatRow.payout,
      now,
      ledger
        ? {
            flow: "nationalization_buyout_float",
            key: `nationalize-float:${target._id.toString()}:${ledger.turn}`,
            ledger: ledger.treasury,
            passThroughCorpId: target._id.toString(),
          }
        : undefined
    );
  }

  // Index-fund shareholders → fund cash (₳). Same pool, no FX (cashAnchor is ₳).
  // Previously dropped by allocateShareholderPool. The whole-corp shell is
  // deleted after this transition, so the fund's holding of it is pulled too.
  // Fund rows are ledgered with the same share_buyout_payout
  // type as every other holder bucket now that fund cash is a ledger account.
  if (allocation.fundRows.length > 0) {
    const { txEntries: fundTxEntries } = await payFundShareholderRows(
      db,
      allocation.fundRows,
      target._id,
      now,
      {
        ledger: ledger
          ? {
              turn: ledger.turn,
              txType: "share_buyout_payout",
              kind: ledger.kind,
              counterpartyId: target._id,
              counterpartyName: target.name,
            }
          : undefined,
      }
    );
    if (ledger) ledgerEntries.push(...fundTxEntries);
  }
  await payNppShareholderRows(db, allocation.nppRows, now);

  // Flush every holder leg in one insert.
  if (ledger && ledgerEntries.length > 0) {
    await emitTxBulk(db, ledgerEntries, await loadTxThresholds(db));
  }
}

/** Ledger context for {@link payShareholders}; omit to skip emission entirely. */
export interface PayShareholdersLedgerContext {
  stockTaxActive?: boolean;
  turn: number;
  /** Short marker for what moved the money, e.g. "agreed_acquisition". */
  kind: string;
  /** Witness context for the public float's treasury leg. */
  treasury?: TreasuryCashOptions;
}

export type PayShareholdersTxInput = Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">;

export /** One holder-side buyout credit, counterparty being the corp being bought out. */
function buyoutPayoutLeg(
  ledger: PayShareholdersLedgerContext,
  target: Corporation,
  subjectType: "character" | "corporation",
  subjectId: ObjectId,
  amount: number,
  currencyCode: string,
  meta?: Record<string, unknown>
): PayShareholdersTxInput {
  return {
    type: "share_buyout_payout",
    turn: ledger.turn,
    createdAt: new Date(),
    subjectType,
    subjectId,
    subjectName: subjectType === "corporation" ? "(corp shareholder)" : "(shareholder)",
    // The exact credited amount: wallets are credited unrounded, so a rounded row
    // would leave the holder's stock check off by the fraction.
    amount,
    currencyCode: currencyCode as CurrencyCode,
    counterpartyType: "corporation",
    counterpartyId: target._id,
    counterpartyName: target.name,
    meta: { kind: ledger.kind, ...(meta ?? {}) },
  };
}
