/** Subsidiary capital transfers reserve a cooldown slot and replay frozen journal legs. */
import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { controllerTransferBarrierError } from "@/lib/corporations/commands/acquisitions/controllerTransferBarrier";
import { resolveControllingCorporateParent } from "@/lib/corporations/reservedCorporateHoldings";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  getCorpFxRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { corporateDiscretionaryCashGuard } from "@/lib/corporations/rules/discretionaryCash";
import { settleTransition, resumeSettlement } from "@/lib/banking/settlementJournal";
import { oid, type BankingTransition } from "@/lib/banking/rules/boundary";
import { buildTxDocs } from "@/lib/financialTxLog/emit";
import { DEFAULT_TX_THRESHOLDS } from "@/lib/db/types/financialTxLog";
import { loadTurnLengthMinutes } from "@/lib/financialTxLog/expiresAt";
import { canActOnCorporationAsParent } from "../authorization";
import {
  SUBSIDIARY_CAPITAL_INJECTION_COOLDOWN_TURNS,
  SUBSIDIARY_CAPITAL_INJECTION_MAX_PCT_OF_PARENT_LIQUID,
} from "../constants";
import { fail, type SubsidiaryCommandResult } from "../commandTypes";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

export interface CapitalInjectionInput {
  sub: Corporation;
  callerUserId: ObjectId;
  callerCharacterId?: string | null;
  /** Native parent currency units. */
  amount: number;
  turn: number;
  now: Date;
}
const receiptId = (key: string) =>
  new ObjectId(createHash("sha256").update(key).digest("hex").slice(0, 24));

export async function capitalInjection(
  db: Db,
  input: CapitalInjectionInput
): Promise<SubsidiaryCommandResult<{ debitedParent: number; creditedSubsidiary: number }>> {
  const { callerUserId, amount, turn, now } = input;
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return fail("Injection amount must be a positive whole number.");
  const sub = await corporationsCollection(db).findOne({ _id: input.sub._id });
  if (!sub) return fail("Subsidiary corporation not found.", 404);
  if (
    !(await canActOnCorporationAsParent(
      db,
      { userId: callerUserId.toString(), activeCharacterId: input.callerCharacterId },
      sub
    ))
  )
    return fail("You are not authorized to manage this subsidiary.", 403);
  const parentPosition = await resolveControllingCorporateParent(db, sub);
  if (!parentPosition) return fail("This corporation is no longer a subsidiary.", 409);
  const parent = await corporationsCollection(db).findOne({ _id: parentPosition.corporationId });
  if (!parent) return fail("Parent corporation not found.", 404);
  const restriction = await controllerTransferBarrierError(db, parent, turn, now);
  if (restriction) return fail(restriction, 403);
  let intent = sub.capitalInjectionIntent;
  const unfinished = intent && !intent.completed;
  if (!unfinished && intent?.turn !== turn) {
    if (
      sub.lastCapitalInjectionTurn != null &&
      turn - sub.lastCapitalInjectionTurn < SUBSIDIARY_CAPITAL_INJECTION_COOLDOWN_TURNS
    )
      return fail("Capital injection is on cooldown.");
    const cap = Math.floor(
      (parent.liquidCapital ?? 0) * SUBSIDIARY_CAPITAL_INJECTION_MAX_PCT_OF_PARENT_LIQUID
    );
    if (amount > cap)
      return fail(
        `A single injection cannot exceed 25% of parent liquid capital (max ${cap.toLocaleString()}).`
      );
    const [parentRate, subRate, turnLengthMinutes] = await Promise.all([
      getCorpFxRate(db, parent),
      getCorpFxRate(db, sub),
      loadTurnLengthMinutes(db),
    ]);
    const anchor = corpLiquidCapitalToAnchor(amount, parent, parentRate);
    const credit = anchorToCorpLiquidCapital(anchor, sub, subRate);
    if (!Number.isFinite(credit) || credit <= 0)
      return fail("Injection conversion is unavailable.");
    const next: NonNullable<Corporation["capitalInjectionIntent"]> = {
      key: `subsidiary-capital:${sub._id.toHexString()}:${turn}:${new ObjectId().toHexString()}`,
      parentId: parent._id.toHexString(),
      turn,
      amountParent: amount,
      amountSubsidiary: credit,
      parentCurrency: resolveCorpLiquidCurrencyCode(parent),
      subsidiaryCurrency: resolveCorpLiquidCurrencyCode(sub),
      parentStampedCurrency: parent.liquidCurrencyCode,
      subsidiaryStampedCurrency: sub.liquidCurrencyCode,
      parentRate,
      subsidiaryRate: subRate,
      createdAt: now,
      turnLengthMinutes,
    };
    const reserved = await corporationsCollection(db).findOneAndUpdate(
      {
        _id: sub._id,
        lastCapitalInjectionTurn: sub.lastCapitalInjectionTurn ?? { $exists: false },
        "capitalInjectionIntent.key": intent?.key ?? { $exists: false },
      },
      { $set: { capitalInjectionIntent: next } },
      { returnDocument: "after" }
    );
    intent =
      reserved?.capitalInjectionIntent ??
      (
        await corporationsCollection(db).findOne(
          { _id: sub._id },
          { projection: { capitalInjectionIntent: 1 } }
        )
      )?.capitalInjectionIntent;
  }
  if (!intent || intent.parentId !== parent._id.toHexString() || intent.amountParent !== amount)
    return fail(
      "A different capital injection owns this cooldown slot. Finish that transfer first.",
      409
    );
  const key = intent.key;
  const anchor = intent.amountParent / intent.parentRate;
  const parentCurrency = intent.parentCurrency ?? "USD";
  const subsidiaryCurrency = intent.subsidiaryCurrency ?? "USD";
  const docs = buildTxDocs(
    [
      {
        type: "corp_capital_injection",
        turn: intent.turn,
        createdAt: intent.createdAt,
        subjectType: "corporation",
        subjectId: parent._id,
        subjectName: parent.name,
        amount: -intent.amountParent,
        anchorAmount: -anchor,
        currencyCode: parentCurrency,
        counterpartyType: "corporation",
        counterpartyId: sub._id,
        meta: { kind: "parent_capital_injection", settlementKey: key },
      },
      {
        type: "corp_capital_injection",
        turn: intent.turn,
        createdAt: intent.createdAt,
        subjectType: "corporation",
        subjectId: sub._id,
        subjectName: sub.name,
        amount: intent.amountSubsidiary,
        anchorAmount: anchor,
        currencyCode: subsidiaryCurrency,
        counterpartyType: "corporation",
        counterpartyId: parent._id,
        meta: { kind: "subsidiary_capital_received", settlementKey: key },
      },
    ],
    DEFAULT_TX_THRESHOLDS,
    intent.turnLengthMinutes,
    new Map()
  );
  const transition: BankingTransition = {
    key,
    retryCreditLegOnGuardFailure: true,
    kind: "subsidiary_capital_injection",
    turn: intent.turn,
    currency: parentCurrency,
    legs: [
      {
        kind: "debit",
        amount: intent.amountParent,
        valuation: { currencyCode: parentCurrency, localPerAnchor: intent.parentRate },
        collection: "corporations",
        filter: {
          _id: oid(parent._id.toHexString()),
          liquidCurrencyCode: intent.parentStampedCurrency ?? { $exists: false },
          liquidCapital: {
            $gte: intent.amountParent / SUBSIDIARY_CAPITAL_INJECTION_MAX_PCT_OF_PARENT_LIQUID,
          },
          ...corporateDiscretionaryCashGuard(),
        },
        path: "liquidCapital",
        note: "Parent capital contribution",
      },
      {
        kind: "credit",
        amount: intent.amountSubsidiary,
        valuation: { currencyCode: subsidiaryCurrency, localPerAnchor: intent.subsidiaryRate },
        collection: "corporations",
        filter: {
          _id: oid(sub._id.toHexString()),
          liquidCurrencyCode: intent.subsidiaryStampedCurrency ?? { $exists: false },
        },
        path: "liquidCapital",
        note: "Subsidiary capital received",
      },
    ],
    projections: [
      {
        collection: "corporations",
        filter: { _id: oid(sub._id.toHexString()) },
        update: { $set: { lastCapitalInjectionTurn: intent.turn } },
        note: "Complete the reserved cooldown slot",
      },
      ...docs.map((doc, index) => ({
        collection: "financialTxLog",
        insert: { ...doc, _id: receiptId(`${key}:${index}`) },
        note: "Capital contribution receipt",
      })),
      {
        collection: "corporations",
        filter: { _id: oid(sub._id.toHexString()), "capitalInjectionIntent.key": key },
        update: { $set: { "capitalInjectionIntent.completed": true } },
        note: "Complete the capital transfer receipt",
      },
    ],
    event: { kind: "monetary.executed", command: "subsidiary.capitalInjection", amount: anchor },
  };
  let result = await settleTransition(db, transition);
  if (result.status === "replayed" && result.error) result = await resumeSettlement(db, key);
  if (result.status === "rejected" && result.appliedLegs.length === 0) {
    await corporationsCollection(db).updateOne(
      { _id: sub._id, "capitalInjectionIntent.key": key },
      { $unset: { capitalInjectionIntent: "" } }
    );
    return fail(
      "No capital moved. The parent must have sufficient unencumbered funds and both currencies must still match the quote.",
      409
    );
  }
  if (result.error || (result.status !== "applied" && result.status !== "replayed"))
    return fail(
      "Capital injection is pending recovery; retry this amount to finish the reserved transfer.",
      409
    );
  return {
    ok: true,
    debitedParent: intent.amountParent,
    creditedSubsidiary: intent.amountSubsidiary,
  };
}
