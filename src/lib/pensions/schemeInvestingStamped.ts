import { loadFxRatesByCurrency, requireCurrencyRate } from "@/lib/currency/corporationCapital";
import { withSessionDb } from "@/lib/db/sessionDb";
/** Frozen scheme investment plans finish before new allocations are admitted. */
import { ObjectId, type Db, type Document } from "mongodb";
import type { IndexFund, IndexFundPosition, IndexFundTransaction } from "@/lib/db/types/indexFund";
import type { PensionScheme } from "@/lib/db/types/pensionScheme";
import { emitTx } from "@/lib/financialTxLog/emit";
import { insertFundTransaction } from "@/lib/indexFunds/fundQueries";
import { isDuplicateKeyError } from "@/lib/elections/duplicateKey";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import { indexFundPositionsCollection } from "@/lib/db/repositories/indexFundPositions";
import { indexFundTransactionsCollection } from "@/lib/db/repositories/indexFundTransactions";
import { pensionInvestableCashAnchor } from "./rules";
import { chooseSchemeFund } from "./rules/chooseSchemeFund";
import type { PensionInvestingResult } from "./schemeInvesting";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import { pensionSchemesCollection } from "@/lib/db/repositories/pensionSchemes";

export async function runStampedPensionSchemeInvestments(
  db: Db,
  currentTurn: number
): Promise<PensionInvestingResult> {
  const result: PensionInvestingResult = { schemesInvesting: 0, investedAnchor: 0, errors: [] };

  // Finish any investment whose cash already left a scheme before anything new starts.
  const unfinished = await pensionSchemesCollection<PensionScheme>(db)
    .find({ pendingInvestment: { $ne: null } })
    .toArray();
  const finishedThisTurn = new Set<string>();
  let receiptRate = unfinished.length
    ? requireCurrencyRate("USD", (await loadFxRatesByCurrency(db)).get("USD"))
    : 1;
  for (const candidate of unfinished) {
    try {
      const recovered = await withSessionDb(db, async (db) => {
        const scheme = await pensionSchemesCollection<PensionScheme>(db).findOne({
          _id: candidate._id,
        });
        const pending = scheme?.pendingInvestment;
        if (!scheme || !pending) return null;
        const fund = await indexFundsCollection<IndexFund>(db).findOne({ _id: pending.fundId });
        if (!fund) throw new Error("Pending investment fund is missing");
        await finishInvestment(db, scheme, fund, pending, receiptRate);
        return pending;
      });
      if (!recovered) continue;
      if (recovered.turn === currentTurn) finishedThisTurn.add(candidate._id.toString());
      result.schemesInvesting += 1;
      result.investedAnchor += recovered.costAnchor;
    } catch (err) {
      result.errors.push(
        `Scheme ${candidate._id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const schemes = await pensionSchemesCollection<PensionScheme>(db)
    .find({ assetsAnchor: { $gt: 0 } })
    .toArray();
  if (schemes.length === 0) return result;

  const funds = await indexFundsCollection<IndexFund>(db)
    .find({ status: "active", kind: "broad", "mandate.mode": { $ne: "picked_stocks" } })
    .toArray();
  if (funds.length === 0) return result;
  receiptRate = requireCurrencyRate("USD", (await loadFxRatesByCurrency(db)).get("USD"));

  for (const candidate of schemes) {
    try {
      const invested = await withSessionDb(db, async (db) => {
        const scheme = await pensionSchemesCollection<PensionScheme>(db).findOne({
          _id: candidate._id,
        });
        if (!scheme) return null;
        if (
          scheme.pendingInvestment ||
          finishedThisTurn.has(scheme._id.toString()) ||
          scheme.lastInvestedTurn === currentTurn
        )
          return null;
        const investable = pensionInvestableCashAnchor({
          cashAnchor: scheme.assetsAnchor,
          benefitsInPaymentAnchor: scheme.benefitsInPaymentAnchor ?? 0,
        });
        if (investable <= 0) return null;

        const selected = chooseSchemeFund(funds, scheme.countryId);
        if (!selected) return null;
        const fund = await indexFundsCollection<IndexFund>(db).findOne({
          _id: selected._id,
          status: "active",
          kind: "broad",
          "mandate.mode": { $ne: "picked_stocks" },
        });
        if (!fund) return null;
        // A fund quoting at or below zero cannot price units. Skipping is the
        // fail-closed reading; buying at a nonsense NAV would hand the scheme
        // units it did not pay for, which is a mint.
        if (!Number.isFinite(fund.quotedNav) || fund.quotedNav <= 0) return null;

        const units = Math.floor(investable / fund.quotedNav);
        if (units < 1) return null;
        // Cost is derived from WHOLE units at NAV, never from `investable`, so the
        // ₳ that leave the scheme and the ₳ that arrive at the fund are the same
        // number by construction.
        const costAnchor = units * fund.quotedNav;

        // One guarded update takes the cash and records the plan, so a death after it can
        // finish the investment forward instead of losing the cash or buying twice. If the
        // scheme's cash moved since the read (the benefit pass runs earlier in the same
        // turn), no units are issued.
        const plan = {
          turn: currentTurn,
          fundId: fund._id,
          units,
          navAnchor: fund.quotedNav,
          costAnchor,
        };
        const debit = await pensionSchemesCollection<PensionScheme>(db).updateOne(
          {
            _id: scheme._id,
            assetsAnchor: { $gte: costAnchor },
            pendingInvestment: null,
            lastInvestedTurn: { $ne: currentTurn },
          },
          {
            $inc: { assetsAnchor: -costAnchor, totalInvestedAnchor: costAnchor },
            $set: { updatedAt: new Date(), pendingInvestment: plan, lastInvestedTurn: currentTurn },
          }
        );
        if (debit.matchedCount === 0) return null;

        await finishInvestment(db, scheme, fund, plan, receiptRate);
        return costAnchor;
      });
      if (invested !== null) {
        result.schemesInvesting += 1;
        result.investedAnchor += invested;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Scheme ${candidate._id.toString()}: ${message}`);
    }
  }

  return result;
}

type PendingInvestment = NonNullable<PensionScheme["pendingInvestment"]>;

/**
 * The fund-side writes of an investment whose cash already left the scheme. Each one is
 * behind a witness for the investment's turn, so running this again after a process
 * death completes what is missing and repeats nothing.
 */
async function finishInvestment(
  db: Db,
  scheme: PensionScheme,
  fund: IndexFund,
  plan: PendingInvestment,
  receiptRate: number
): Promise<void> {
  const now = new Date();
  const schemeKey = scheme._id.toString();
  const fundTurn = fund.pensionSubscriptionTurns?.[schemeKey];
  if (fundTurn !== undefined && fundTurn > plan.turn)
    throw new Error("Older pension investment cash requires subscription reconciliation");

  // 1. The scheme's position, stamped with the turn it was credited on.
  const positions = indexFundPositionsCollection<IndexFundPosition>(db);
  const identity = {
    fundId: plan.fundId,
    holderKind: "pension_scheme" as const,
    pensionSchemeId: scheme._id,
  };
  let position = await positions.findOne(identity);
  if (!position) {
    try {
      await positions.insertOne({
        _id: new ObjectId(),
        ...identity,
        units: plan.units,
        avgNavAnchor: plan.navAnchor,
        legacyUnits: 0,
        lastSubscriptionTurn: plan.turn,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      position = await positions.findOne(identity);
    }
  }
  if (position?.lastSubscriptionTurn !== undefined && position.lastSubscriptionTurn > plan.turn)
    throw new Error("Older pension investment position requires subscription reconciliation");
  if (position && position.lastSubscriptionTurn !== plan.turn) {
    const totalUnits = position.units + plan.units;
    const avgNav =
      totalUnits > 0
        ? (position.units * (position.avgNavAnchor ?? plan.navAnchor) +
            plan.units * plan.navAnchor) /
          totalUnits
        : plan.navAnchor;
    await positions.updateOne(
      { _id: position._id, lastSubscriptionTurn: { $ne: plan.turn } },
      {
        $set: {
          units: totalUnits,
          avgNavAnchor: avgNav,
          lastSubscriptionTurn: plan.turn,
          updatedAt: now,
        },
      }
    );
  }

  // 2. The fund's supply and cash, once per scheme and turn.
  const witness = `pensionSubscriptionTurns.${schemeKey}`;
  await indexFundsCollection<IndexFund>(db).updateOne(
    { _id: plan.fundId, [witness]: { $ne: plan.turn } },
    {
      $inc: { unitSupply: plan.units, cashAnchor: plan.costAnchor },
      $set: { updatedAt: now, [witness]: plan.turn },
    }
  );

  // 3. The fund transaction row, unless it already exists.
  const hasTransaction = await indexFundTransactionsCollection<IndexFundTransaction>(db).findOne({
    fundId: plan.fundId,
    pensionSchemeId: scheme._id,
    kind: "subscription",
    turn: plan.turn,
  });
  if (!hasTransaction) {
    await insertFundTransaction(db, {
      fundId: plan.fundId,
      kind: "subscription",
      turn: plan.turn,
      holderKind: "pension_scheme",
      pensionSchemeId: scheme._id,
      units: plan.units,
      navAnchor: plan.navAnchor,
      amountAnchor: plan.costAnchor,
      note: `${scheme.unionName} pension scheme`,
      createdAt: now,
    } as Omit<IndexFundTransaction, "_id">);
  }

  // 4. The ledger row, unless it already exists.
  const hasLedgerRow = await financialTxLogCollection<Document>(db).findOne({
    type: "index_fund_subscribe",
    turn: plan.turn,
    subjectId: scheme._id,
  });
  if (!hasLedgerRow) {
    await emitTx(db, {
      type: "index_fund_subscribe",
      turn: plan.turn,
      createdAt: now,
      subjectType: "pension_scheme",
      subjectId: scheme._id,
      subjectName: `${scheme.unionName} pension scheme`,
      amount: -plan.costAnchor * receiptRate,
      anchorAmount: -plan.costAnchor,
      currencyCode: "USD",
      counterpartyType: "system",
      counterpartyName: fund.name,
      meta: {
        schemeId: schemeKey,
        fundId: plan.fundId.toString(),
        fundSlug: fund.slug,
        fundCurrency: fund.anchorCurrencyCode,
        units: plan.units,
        navAnchor: plan.navAnchor,
        source: "cron",
        receiptValuationRate: receiptRate,
        bookCurrency: "anchor",
      },
    });
  }

  // 5. Done: the plan is cleared last.
  await pensionSchemesCollection<PensionScheme>(db).updateOne(
    { _id: scheme._id, "pendingInvestment.turn": plan.turn },
    { $set: { pendingInvestment: null, updatedAt: now } }
  );
}
