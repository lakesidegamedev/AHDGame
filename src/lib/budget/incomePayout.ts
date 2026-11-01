/** Atomic source credit: current tax, old arrears, then spendable income. */
import { createHash } from "node:crypto";
import { ObjectId, type Db, type Document, type AnyBulkWriteOperation } from "mongodb";
import type { Character, GameState, GameConfig } from "@/lib/db/types";
import type { PlayerIncomeTaxAssessment as Assessment } from "@/lib/db/types/incomeTax";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { TurnMustStopError } from "@/lib/turn/turnMustStop";
import { runRequiredTransaction } from "@/lib/db/runRequiredTransaction";
import { computeExpiresAtSync } from "@/lib/financialTxLog/expiresAt";
import { loadStockWithholdingContexts, stockSellerKey } from "./stockSaleWithholding";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  earnedIncomeTier,
  annualizedIncome,
  TAXABLE_PLAYER_INCOME_TYPES,
  incomeTaxRate,
} from "./rules/incomeTaxTiers";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import {
  validatePendingStockTaxReceipt,
  taxableStockAmounts,
  capitalGainsTaxRate,
} from "./rules/capitalGainsTax";
import { incomeTaxPaymentLegs, planIncomePayout } from "./rules/incomePayout";

export interface IncomeCredit {
  characterId: ObjectId;
  ownerCollection: "characters" | "imperialCharacters";
  currency: CurrencyCode;
  gross: number;
  income: number;
  capital?: number;
  arrearsExempt?: number;
  /** Interest stays in savings; only earned interest, never principal, is diverted. */
  destination?: string;
  settledReceipt?: { key: string; cap: number };
  interest?: {
    pendingPath?: string;
    authoritative?: boolean;
    centralBankId?: string;
    bankId?: ObjectId;
  };
}
type EarningsEntry = Pick<
  FinancialTxLogEntry,
  "subjectId" | "type" | "turn" | "amount" | "anchorAmount" | "currencyCode" | "meta"
>;
interface IncomeWallet {
  _id: ObjectId;
  settledKeys?: string[];
}
interface PayoutReceipt {
  _id: string;
  kind: "income-payout";
  turn: number;
  worldId: string;
  fingerprint: string;
  credits: (IncomeCredit & { net: number; currentTax: number; arrearsPaid: number })[];
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const idFor = (value: string) => new ObjectId(hash(value).slice(0, 24));

/** Bounded round trips per source batch, independent of the number of recipients. */
export async function creditIncomeAfterTax(
  db: Db,
  source: string,
  turn: number,
  now: Date,
  credits: IncomeCredit[]
): Promise<PayoutReceipt["credits"]> {
  if (!credits.length) return [];
  const fingerprint = hash(JSON.stringify(credits));
  return runRequiredTransaction(
    async (session) => {
      const state = await db
        .collection<GameState>("gameState")
        .findOne(
          { _id: "current" },
          { session, projection: { resetWorldId: 1, forexEnabled: 1, stockHoldingTaxStartTurn: 1 } }
        );
      const worldId = state?.resetWorldId ?? "legacy";
      const key = `income-payout:${worldId}:${turn}:${source}`;
      const receipts = db.collection<PayoutReceipt>("playerIncomeTaxBatches");
      const receiptId = `income-payout:${worldId}:${source}`;
      const previous = await receipts.findOne({ _id: receiptId }, { session });
      if (previous && previous.turn > turn)
        throw new Error("Stale income payout cannot be replayed");
      if (previous?.turn === turn) {
        if (previous.fingerprint !== fingerprint) throw new Error("Accepted income payout changed");
        return previous.credits;
      }
      const sellers = [
        ...new Map(
          credits.map((credit) => {
            const seller = { id: credit.characterId, collection: credit.ownerCollection };
            return [stockSellerKey(seller), seller];
          })
        ).values(),
      ];
      const contexts = await loadStockWithholdingContexts(db, sellers, turn, {
        income: true,
        session,
      });
      const exchange = await db
        .collection("exchangeRates")
        .find(
          {},
          {
            session,
            projection: { currencyCode: 1, rate: 1 },
          }
        )
        .toArray();
      const rates = new Map<string, number>(exchange.map((row) => [row.currencyCode, row.rate]));
      const config = await db.collection<GameConfig>("gameConfig").findOne(
        { _id: "default" },
        {
          session,
          projection: { treasuryCashLedgerEnabled: 1, ledgerShadow: 1, turnLengthMinutes: 1 },
        }
      );
      const regularActors = await db
        .collection<Character>("characters")
        .find(
          {
            _id: {
              $in: sellers
                .filter((seller) => seller.collection === "characters")
                .map((seller) => seller.id),
            },
          },
          { session, projection: { name: 1, pendingStockTaxReceipts: 1 } }
        )
        .toArray();
      const imperialActors = await db
        .collection<Character>("imperialCharacters")
        .find(
          {
            _id: {
              $in: sellers
                .filter((seller) => seller.collection === "imperialCharacters")
                .map((seller) => seller.id),
            },
          },
          { session, projection: { name: 1, pendingStockTaxReceipts: 1 } }
        )
        .toArray();
      const names = new Map([
        ...regularActors.map(
          (actor) => ["characters:" + actor._id.toHexString(), actor.name] as const
        ),
        ...imperialActors.map(
          (actor) => ["imperialCharacters:" + actor._id.toHexString(), actor.name] as const
        ),
      ]);
      const earnings: EarningsEntry[] = await db
        .collection<FinancialTxLogEntry>("financialTxLog")
        .find(
          {
            subjectType: "character",
            subjectId: { $in: sellers.map((seller) => seller.id) },
            type: { $in: [...TAXABLE_PLAYER_INCOME_TYPES] },
            amount: { $gt: 0 },
            turn: { $gte: Math.max(0, turn - 11), $lte: turn },
          },
          {
            session,
            projection: {
              subjectId: 1,
              type: 1,
              turn: 1,
              amount: 1,
              currencyCode: 1,
              anchorAmount: 1,
              meta: 1,
            },
          }
        )
        .toArray();
      const medians = await db
        .collection("macroMetrics")
        .find(
          {},
          {
            session,
            projection: { "economic.medianIncome.value": 1 },
          }
        )
        .toArray();
      const medianByState = new Map(
        medians.map((row) => [
          String(row._id),
          row.economic?.medianIncome?.value as number | undefined,
        ])
      );
      if (state?.stockHoldingTaxStartTurn !== undefined && turn >= state.stockHoldingTaxStartTurn)
        for (const actor of [...regularActors, ...imperialActors])
          for (const receipt of actor.pendingStockTaxReceipts ?? []) {
            validatePendingStockTaxReceipt(receipt);
            if (receipt.assessmentTurn > turn || receipt.assessmentTurn < turn - 11) continue;
            earnings.push({
              subjectId: actor._id,
              type: "stock_trade_sell",
              turn: receipt.assessmentTurn,
              amount: receipt.amount,
              anchorAmount: receipt.anchorAmount,
              currencyCode: receipt.currencyCode as CurrencyCode,
              meta: { stockTax: receipt },
            });
          }
      const earningsByActor = new Map<string, typeof earnings>();
      for (const row of earnings) {
        if (!row.subjectId) continue;
        const id = row.subjectId.toHexString();
        const rows = earningsByActor.get(id) ?? [];
        rows.push(row);
        earningsByActor.set(id, rows);
      }
      const incomingByActor = new Map<string, number>();
      for (const credit of credits) {
        const key = credit.ownerCollection + ":" + credit.characterId.toHexString();
        if (!contexts.has(key)) continue;
        const rate = rates.get(credit.currency);
        if (!rate || !Number.isFinite(rate)) throw new Error("Earnings exchange rate unavailable");
        incomingByActor.set(key, (incomingByActor.get(key) ?? 0) + credit.income / rate);
      }
      for (const [actorKey, context] of contexts) {
        if (turn < (context.taxStartTurn ?? turn)) continue;
        const id = actorKey.slice(actorKey.indexOf(":") + 1);
        const firstTurn = Math.max(context.taxStartTurn ?? turn, turn - 11);
        let anchor = incomingByActor.get(actorKey) ?? 0;
        for (const row of earningsByActor.get(id) ?? []) {
          if (row.turn < firstTurn) continue;
          const taxable =
            row.type === "corp_dividend" || row.type === "stock_trade_sell"
              ? taxableStockAmounts(row.type, row.amount, row.meta?.stockTax)
              : { income: row.amount, capital: 0 };
          const income = Math.max(
            0,
            taxable.income - Number(row.meta?.passThroughTaxedAmount ?? 0)
          );
          const fx = rates.get(row.currencyCode);
          if (!fx || !Number.isFinite(fx)) throw new Error("Earnings exchange rate unavailable");
          anchor +=
            row.amount > 0 ? ((row.anchorAmount ?? row.amount / fx) * income) / row.amount : 0;
        }
        const median = medianByState.get(context.stateId);
        if (!median || !Number.isFinite(median) || median <= 0)
          throw new Error("Income-tier reference unavailable");
        context.tier = earnedIncomeTier(
          annualizedIncome(
            anchor * context.regionalFx,
            Math.min(12, turn - (context.taxStartTurn ?? turn) + 1),
            TURNS_PER_YEAR
          ),
          median
        );
      }
      const debts = await db
        .collection<Assessment>("playerIncomeTaxAssessments")
        .find(
          {
            worldId,
            status: "unpaid",
            withheldAtSource: { $ne: true },
            turn: { $lte: turn },
            characterId: { $in: sellers.map((seller) => seller.id) },
          },
          { session }
        )
        .toArray();
      const debtsByActor = new Map<string, Assessment[]>();
      for (const debt of debts) {
        const key = debt.ownerCollection + ":" + debt.characterId.toHexString();
        const rows = debtsByActor.get(key) ?? [];
        rows.push(debt);
        debtsByActor.set(key, rows);
      }
      const walletOps = {
        characters: [] as AnyBulkWriteOperation<IncomeWallet>[],
        imperialCharacters: [] as AnyBulkWriteOperation<IncomeWallet>[],
      };
      const savingsOps: AnyBulkWriteOperation<Document>[] = [];
      const bankOps: AnyBulkWriteOperation<Document>[] = [];
      const centralBankOps: AnyBulkWriteOperation<Document>[] = [];
      const assessments: AnyBulkWriteOperation<Assessment>[] = [];
      const national = new Map<string, { countryId: string; amount: number }>();
      const regional = new Map<string, { countryId: string; amount: number }>();
      const logs: Document[] = [];
      const ledger: Document[] = [];
      const results: PayoutReceipt["credits"] = [];
      const recordPayment = (
        assessment: Assessment,
        federal: number,
        region: number,
        suffix: string,
        arrears: boolean
      ) => {
        const n = national.get(assessment.nationalBudgetId) ?? {
          countryId: assessment.countryId,
          amount: 0,
        };
        n.amount += (federal / assessment.sourceFx) * assessment.nationalFx;
        national.set(assessment.nationalBudgetId, n);
        const r = regional.get(assessment.stateId) ?? {
          countryId: assessment.countryId,
          amount: 0,
        };
        r.amount += (region / assessment.sourceFx) * assessment.regionalFx;
        regional.set(assessment.stateId, r);
        if (config?.ledgerShadow) {
          const payment = incomeTaxPaymentLegs({
            ...assessment,
            characterId: assessment.characterId.toHexString(),
            federal,
            regional: region,
            capitalGains: assessment.taxKind === "capitalGains",
            fundedTreasury: config.treasuryCashLedgerEnabled === true,
          });
          for (const [name, legs] of [
            ["tax", payment.legs],
            ["cash", payment.cash],
          ] as const)
            if (legs.length)
              ledger.push({
                _id: idFor(key + suffix + ":ledger:" + name),
                turn,
                createdAt: now,
                txType:
                  assessment.taxKind === "capitalGains"
                    ? "player_capital_gains_tax"
                    : "player_income_tax",
                legs,
                balanced: true,
                emitSite: "budget/incomePayout",
              });
        }
        const common = {
          turn,
          createdAt: now,
          expiresAt: computeExpiresAtSync(now, config?.turnLengthMinutes ?? 60),
          flagged: false,
        };
        logs.push({
          ...common,
          _id: idFor(key + suffix),
          type:
            assessment.taxKind === "capitalGains"
              ? "player_capital_gains_tax"
              : "player_income_tax",
          subjectType: "character",
          subjectId: assessment.characterId,
          subjectName: assessment.name,
          amount: -federal - region,
          currencyCode: assessment.currency,
          anchorAmount: (-federal - region) / assessment.sourceFx,
          meta: {
            ledgerOwnedBySettlement: true,
            assessmentId: assessment._id,
            assessedTurn: assessment.turn,
            nationalTax: federal,
            regionalTax: region,
            grossIncome: assessment.gross,
            netIncome: assessment.net,
            withheldAtSource: true,
            arrears,
            source,
            imperial: assessment.ownerCollection === "imperialCharacters",
          },
        });
        for (const [amount, currencyCode, countryId, stateId] of [
          [
            (federal / assessment.sourceFx) * assessment.nationalFx,
            assessment.nationalCurrency,
            assessment.countryId,
            undefined,
          ],
          [
            (region / assessment.sourceFx) * assessment.regionalFx,
            assessment.regionalCurrency,
            assessment.countryId,
            assessment.stateId,
          ],
        ] as const)
          if (amount > 0)
            logs.push({
              ...common,
              _id: idFor(key + suffix + (stateId ? ":regional" : ":national")),
              type: "gov_tax_revenue",
              subjectType: "government",
              subjectName: stateId ?? countryId,
              countryId,
              amount,
              currencyCode,
              meta: {
                source:
                  assessment.taxKind === "capitalGains"
                    ? "player_capital_gains_tax"
                    : "player_income_tax",
                ledgerOwnedBySettlement: true,
                assessmentId: assessment._id,
                stateId,
                treasuryCashMovement: !stateId,
              },
            });
      };
      for (const [index, credit] of credits.entries()) {
        const actorKey = credit.ownerCollection + ":" + credit.characterId.toHexString();
        if (!names.has(actorKey)) throw new Error("Income recipient unavailable");
        const context = contexts.get(actorKey);
        const eligible = debtsByActor.get(actorKey) ?? [];
        const sourceFx =
          rates.get(credit.currency) ?? (!context && eligible.length === 0 ? 1 : undefined);
        if (!sourceFx || !Number.isFinite(sourceFx) || sourceFx <= 0)
          throw new Error("Income payout exchange rate unavailable");
        const taxable = context && turn >= (context.taxStartTurn ?? turn);
        const plan = planIncomePayout({
          gross: credit.gross,
          income: taxable ? credit.income : 0,
          capital: taxable ? (credit.capital ?? 0) : 0,
          sourceFx,
          arrearsExempt: credit.arrearsExempt,
          incomeRates: {
            national: taxable ? incomeTaxRate(context.nationalRates, context.tier) : 0,
            regional: taxable ? incomeTaxRate(context.regionalRates, context.tier) : 0,
          },
          capitalRates: {
            national: taxable ? capitalGainsTaxRate(context.nationalRates, context.tier) : 0,
            regional: taxable ? capitalGainsTaxRate(context.regionalRates, context.tier) : 0,
          },
          debts: eligible.map((debt) => ({ ...debt, id: debt._id })),
        });
        const path =
          credit.destination ??
          (state?.forexEnabled ? "currencyBalances.personal." + credit.currency : "cashOnHand");
        walletOps[credit.ownerCollection].push({
          updateOne: {
            filter: { _id: credit.characterId },
            update: {
              ...(context ? { $set: { incomeTier: context.tier } } : {}),
              ...(credit.settledReceipt
                ? {
                    $push: {
                      settledKeys: {
                        $each: [credit.settledReceipt.key],
                        $slice: -credit.settledReceipt.cap,
                      },
                    },
                  }
                : {}),
              $inc: {
                [path]: plan.net,
                ...(credit.interest
                  ? { ["currencyBalances.interestEarned." + credit.currency]: credit.gross }
                  : {}),
                ...(credit.interest?.pendingPath
                  ? { [credit.interest.pendingPath]: -credit.gross }
                  : {}),
              },
            },
          },
        });
        if (credit.interest?.authoritative) {
          savingsOps.push({
            updateOne: {
              filter: {
                ownerType: "character",
                ownerId: credit.characterId,
                currency: credit.currency,
                status: { $ne: "closed" },
              },
              update: {
                $inc: {
                  balance: plan.net,
                  interestEarned: credit.gross,
                  version: 1,
                  ...(credit.interest.pendingPath ? { accruedInterest: -credit.gross } : {}),
                },
                $set: { lastSettledTurn: turn, updatedAt: now },
              },
            },
          });
        }
        if (credit.interest?.centralBankId && credit.interest.authoritative)
          centralBankOps.push({
            updateOne: {
              filter: { _id: credit.interest.centralBankId as never },
              update: { $inc: { householdSavingsLiability: plan.net } },
            },
          });
        if (credit.interest?.bankId) {
          const debit = credit.interest.authoritative ? credit.gross - plan.net : credit.gross;
          bankOps.push({
            updateOne: {
              filter: { _id: credit.interest.bankId, "bankCharter.cashReserves": { $gte: debit } },
              update: {
                $inc: {
                  "bankCharter.cashReserves": -debit,
                  ...(credit.interest.authoritative
                    ? { "bankCharter.playerDeposits": plan.net }
                    : {}),
                },
              },
            },
          });
        }
        if (context)
          for (const [taxKind, tax] of [
            ["income", plan.incomeTax],
            ["capitalGains", plan.capitalTax],
          ] as const) {
            if (!(tax.gross > 0)) continue;
            const {
              nationalRates: _national,
              regionalRates: _regional,
              taxStartTurn: _start,
              ...terms
            } = context;
            const assessment: Assessment = {
              ...terms,
              ...tax,
              taxKind,
              _id: `${key}:${index}:${taxKind}`,
              characterId: credit.characterId,
              ownerCollection: credit.ownerCollection,
              turn,
              worldId,
              name: names.get(actorKey)!,
              currency: credit.currency,
              sourcePath: path,
              sourceFx,
              walletFx: state?.forexEnabled ? sourceFx : 1,
              withheldAtSource: true,
              collectedFederal: tax.federal,
              collectedRegional: tax.regional,
              collectedTurn: turn,
              status: "paid",
              createdAt: now,
            };
            assessments.push({ insertOne: { document: assessment } });
            if (tax.federal + tax.regional > 0)
              recordPayment(assessment, tax.federal, tax.regional, `:${index}:${taxKind}`, false);
          }
        for (const payment of plan.arrears) {
          const debt = eligible.find((row) => row._id === payment.id)!;
          const slice = payment.slice;
          debt.collectedFederal = slice.previousFederal + slice.federal;
          debt.collectedRegional = slice.previousRegional + slice.regional;
          assessments.push({
            updateOne: {
              filter: { _id: debt._id, status: "unpaid" },
              update: {
                $set: {
                  collectedFederal: debt.collectedFederal,
                  collectedRegional: debt.collectedRegional,
                  collectedTurn: turn,
                  status: slice.fullyPaid ? "paid" : "unpaid",
                },
              },
            },
          });
          recordPayment(debt, slice.federal, slice.regional, `:${index}:arrears:${debt._id}`, true);
        }
        results.push({
          ...credit,
          net: plan.net,
          currentTax: plan.currentTax,
          arrearsPaid: plan.arrearsPaid,
        });
      }
      if (walletOps.characters.length) {
        const credited = await db
          .collection<IncomeWallet>("characters")
          .bulkWrite(walletOps.characters, { session });
        if (credited.matchedCount !== walletOps.characters.length)
          throw new Error("Income recipient changed");
      }
      if (walletOps.imperialCharacters.length) {
        const credited = await db
          .collection<IncomeWallet>("imperialCharacters")
          .bulkWrite(walletOps.imperialCharacters, { session });
        if (credited.matchedCount !== walletOps.imperialCharacters.length)
          throw new Error("Income recipient changed");
      }
      if (savingsOps.length) {
        const saved = await db.collection("savingsAccounts").bulkWrite(savingsOps, { session });
        if (saved.matchedCount !== savingsOps.length)
          throw new Error("Income savings account unavailable");
      }
      if (centralBankOps.length) {
        const saved = await db.collection("centralBanks").bulkWrite(centralBankOps, { session });
        if (saved.matchedCount !== centralBankOps.length)
          throw new Error("Income central bank unavailable");
      }
      if (bankOps.length) {
        const saved = await db.collection("corporations").bulkWrite(bankOps, { session });
        if (saved.matchedCount !== bankOps.length)
          throw new Error("Bank cannot fund income withholding");
      }
      if (assessments.length)
        await db
          .collection<Assessment>("playerIncomeTaxAssessments")
          .bulkWrite(assessments, { session });
      const nationalOps = [...national]
        .filter(([, row]) => row.amount > 0)
        .map(([id, row]) => ({
          updateOne: {
            filter: { _id: id as never, countryId: row.countryId },
            update: {
              $inc: {
                treasuryBalance: row.amount,
                ...(config?.treasuryCashLedgerEnabled ? { treasuryCashLocal: row.amount } : {}),
              },
            },
          },
        }));
      if (nationalOps.length) {
        const saved = await db.collection("federalBudget").bulkWrite(nationalOps, { session });
        if (saved.matchedCount !== nationalOps.length)
          throw new Error("Income tax national treasury unavailable");
      }
      const regionalOps = [...regional]
        .filter(([, row]) => row.amount > 0)
        .map(([id, row]) => ({
          updateOne: {
            filter: { _id: id as never, countryId: row.countryId },
            update: { $inc: { balance: row.amount } },
          },
        }));
      if (regionalOps.length) {
        const saved = await db.collection("stateBudgets").bulkWrite(regionalOps, { session });
        if (saved.matchedCount !== regionalOps.length)
          throw new Error("Income tax regional treasury unavailable");
      }
      if (logs.length)
        await db.collection("financialTxLog").bulkWrite(
          logs.map((document) => ({ insertOne: { document } })),
          { session }
        );
      if (ledger.length)
        await db.collection("ledgerEntries").bulkWrite(
          ledger.map((document) => ({ insertOne: { document } })),
          { session }
        );
      const receipt: PayoutReceipt = {
        _id: receiptId,
        kind: "income-payout",
        turn,
        worldId,
        fingerprint,
        credits: results,
      };
      if (previous)
        await receipts.replaceOne({ _id: receiptId, turn: previous.turn }, receipt, { session });
      else await receipts.insertOne(receipt, { session });
      return results;
    },
    { client: db.client, timeoutMS: 60000, maxCommitTimeMS: 10000 }
  ).catch((error: unknown) => {
    throw new TurnMustStopError("incomePayout", error);
  });
}
