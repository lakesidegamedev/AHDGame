/**
 * Pension schemes invest idle cash in index funds as a new HOLDER KIND, not a
 * new fund mechanic: they use creditFundPosition, an $inc on the fund's
 * unitSupply and cashAnchor, and an indexFundTransactions row, whole units at
 * quoted NAV, so the fund's backing ratio is unchanged.
 *
 * Fail closed: if index funds are off this pass does nothing and schemes hold
 * cash; contributions, accruals, benefits and funding ratios all keep working.
 * Investment is optional, never a dependency.
 *
 * The pensionInvestableCashAnchor buffer exists because fund units are not a
 * payment instrument for schemes (no redemption path), so invested cash is
 * unavailable to pensioners; without the buffer a scheme manufactures its own
 * benefit cut.
 */

import { ObjectId, type Db, type Document } from "mongodb";
import type { IndexFund, IndexFundPosition, IndexFundTransaction } from "@/lib/db/types/indexFund";
import type { PensionScheme } from "@/lib/db/types/pensionScheme";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { emitTx } from "@/lib/financialTxLog/emit";
import { isIndexFundsEnabled } from "@/lib/indexFunds/featureFlag";
import { insertFundTransaction } from "@/lib/indexFunds/fundQueries";
import { isDuplicateKeyError } from "@/lib/elections/duplicateKey";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import { indexFundPositionsCollection } from "@/lib/db/repositories/indexFundPositions";
import { indexFundTransactionsCollection } from "@/lib/db/repositories/indexFundTransactions";
import { pensionInvestableCashAnchor } from "./rules";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import { pensionSchemesCollection } from "@/lib/db/repositories/pensionSchemes";

export interface PensionInvestingResult {
  schemesInvesting: number;
  investedAnchor: number;
  errors: string[];
}

/**
 * Choose where a scheme invests.
 *
 * A scheme is a conservative, mandate-bound institution, not a stock picker:
 * the country-scoped broad index for its own country, falling back to the
 * global broad index when its country has none. Sector funds are deliberately
 * not eligible. Concentrating a country's pensions in the sector its members
 * work in is exactly the failure mode occupational schemes are regulated
 * against, and the game does not need a scheme whose assets collapse in the
 * same turn its employer does.
 */
export function chooseSchemeFund(funds: IndexFund[], countryId: string): IndexFund | null {
  const eligible = funds.filter(
    (f) => f.status === "active" && f.kind === "broad" && f.mandate?.mode !== "picked_stocks"
  );
  const home = eligible.find((f) => f.scope === "country" && f.countryId === countryId);
  if (home) return home;
  return eligible.find((f) => f.scope === "global") ?? null;
}

export async function runPensionSchemeInvestments(
  db: Db,
  currentTurn: number
): Promise<PensionInvestingResult> {
  const result: PensionInvestingResult = { schemesInvesting: 0, investedAnchor: 0, errors: [] };

  // Fail closed. Schemes simply hold cash and every other pension mechanic is
  // untouched.
  if (!(await isIndexFundsEnabled())) return result;

  // Finish any investment whose cash already left a scheme before anything new starts.
  const unfinished = await pensionSchemesCollection<PensionScheme>(db)
    .find({ pendingInvestment: { $ne: null } })
    .toArray();
  const finishedThisTurn = new Set<string>();
  const pendingFunds =
    unfinished.length === 0
      ? []
      : await indexFundsCollection<IndexFund>(db)
          .find({
            _id: {
              $in: unfinished.flatMap((s) =>
                s.pendingInvestment ? [s.pendingInvestment.fundId] : []
              ),
            },
          })
          .toArray();
  const pendingFundById = new Map(pendingFunds.map((f) => [f._id.toString(), f]));
  for (const scheme of unfinished) {
    try {
      const pending = scheme.pendingInvestment!;
      const fund = pendingFundById.get(pending.fundId.toString());
      if (!fund) {
        result.errors.push(`Scheme ${scheme._id.toString()}: pending investment fund is missing`);
        continue;
      }
      await finishInvestment(db, scheme, fund, pending);
      if (pending.turn === currentTurn) finishedThisTurn.add(scheme._id.toString());
      result.schemesInvesting += 1;
      result.investedAnchor += pending.costAnchor;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Scheme ${scheme._id.toString()}: ${message}`);
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

  for (const scheme of schemes) {
    try {
      if (
        scheme.pendingInvestment ||
        finishedThisTurn.has(scheme._id.toString()) ||
        scheme.lastInvestedTurn === currentTurn
      )
        continue;
      const investable = pensionInvestableCashAnchor({
        cashAnchor: scheme.assetsAnchor,
        benefitsInPaymentAnchor: scheme.benefitsInPaymentAnchor ?? 0,
      });
      if (investable <= 0) continue;

      const fund = chooseSchemeFund(funds, scheme.countryId);
      if (!fund) continue;
      // A fund quoting at or below zero cannot price units. Skipping is the
      // fail-closed reading; buying at a nonsense NAV would hand the scheme
      // units it did not pay for, which is a mint.
      if (!Number.isFinite(fund.quotedNav) || fund.quotedNav <= 0) continue;

      const units = Math.floor(investable / fund.quotedNav);
      if (units < 1) continue;
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
      if (debit.matchedCount === 0) continue;

      await finishInvestment(db, scheme, fund, plan);
      result.schemesInvesting += 1;
      result.investedAnchor += costAnchor;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Scheme ${scheme._id.toString()}: ${message}`);
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
  plan: PendingInvestment
): Promise<void> {
  const now = new Date();
  const schemeKey = scheme._id.toString();

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
      amount: -plan.costAnchor,
      anchorAmount: -plan.costAnchor,
      currencyCode: (COUNTRY_CURRENCY_MAP[scheme.countryId] ?? "USD") as CurrencyCode,
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
      },
    });
  }

  // 5. Done: the plan is cleared last.
  await pensionSchemesCollection<PensionScheme>(db).updateOne(
    { _id: scheme._id, "pendingInvestment.turn": plan.turn },
    { $set: { pendingInvestment: null, updatedAt: now } }
  );
}
