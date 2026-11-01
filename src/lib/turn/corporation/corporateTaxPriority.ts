/** Tax-first corporate cash settlement. Historical journals keep their original recovery path. */
import { createHash } from "node:crypto";
import { ObjectId, type Db, type Document, type AnyBulkWriteOperation } from "mongodb";
import type { Corporation } from "@/lib/db/types/corporation";
import type { CorpSnapshot } from "./types";
import { runRequiredTransaction } from "@/lib/db/runRequiredTransaction";
import { loadTreasuryCashContext } from "@/lib/nationalization/treasuryLedger";
import { COUNTRY_CURRENCY_MAP, type CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import { treasuryAnchorValuation } from "@/lib/budget/rules/treasuryAccrual";
import { TurnMustStopError } from "@/lib/turn/turnMustStop";
import { planCorporateTaxPriority } from "./rules/corporateTaxPriority";
const idFor = (value: string) =>
  new ObjectId(createHash("sha256").update(value).digest("hex").slice(0, 24));

export async function settleCorporateTaxPriority(
  db: Db,
  snapshots: readonly CorpSnapshot[],
  turn: number,
  now: Date,
  source: "operating" | "dividend" = "operating"
) {
  if (!snapshots.length) return;
  const context = await loadTreasuryCashContext(db, turn);
  if (!context?.treasuryCashLedgerEnabled)
    throw new Error("Corporate withholding needs Treasury cash accounting");
  const unique = new Set(snapshots.map((row) => row.corpId.toHexString()));
  if (unique.size !== snapshots.length)
    throw new Error("Duplicate corporate tax settlement target");
  for (let offset = 0; offset < snapshots.length; offset += 64) {
    const rows = snapshots.slice(offset, offset + 64);
    const closing = await settleCorporateTaxPriorityBatch(db, rows, turn, now, context, source);
    for (const row of rows) {
      const cash = closing.get(row.corpId.toHexString());
      if (cash !== undefined) {
        row.liquidCapital = cash;
        row.liquidCapitalAnchorAfterIncome = cash / row.operatingCashLocalPerAnchor!;
      }
    }
  }
}

async function settleCorporateTaxPriorityBatch(
  db: Db,
  rows: readonly CorpSnapshot[],
  turn: number,
  now: Date,
  context: NonNullable<Awaited<ReturnType<typeof loadTreasuryCashContext>>>,
  source: "operating" | "dividend"
) {
  return runRequiredTransaction(
    async (session) => {
      const keys = rows.map(
        (row) =>
          `corporate-tax-priority:${turn}:${row.corpId}${source === "dividend" ? ":dividend" : ""}`
      );
      const prior = await db
        .collection<{ _id: string }>("bankMoneyMoves")
        .find({ _id: { $in: keys } }, { session, projection: { _id: 1 } })
        .toArray();
      const done = new Set(prior.map((row) => row._id));
      const corporations = await db
        .collection<Corporation>("corporations")
        .find(
          { _id: { $in: rows.map((row) => row.corpId) } },
          {
            session,
            projection: {
              liquidCapital: 1,
              pendingOperatingCash: 1,
              operatingCashArrearsByCurrency: 1,
              federalTaxArrearsAnchorByCountry: 1,
            },
          }
        )
        .toArray();
      const byId = new Map(corporations.map((corp) => [corp._id.toHexString(), corp]));
      const closing = new Map(
        corporations.map((corp) => [corp._id.toHexString(), corp.liquidCapital])
      );
      const corpOps: AnyBulkWriteOperation<Corporation>[] = [];
      const treasury = new Map<string, number>();
      const household = new Map<
        string,
        { amount: number; worldEpoch: string; currency: CurrencyCode }
      >();
      const receipts: Document[] = [];
      const ledger: Document[] = [];
      for (const row of rows) {
        const key = `corporate-tax-priority:${turn}:${row.corpId}${source === "dividend" ? ":dividend" : ""}`;
        if (done.has(key)) continue;
        const corp = byId.get(row.corpId.toHexString());
        const rate = row.operatingCashLocalPerAnchor;
        const currency = row.operatingCashCurrency;
        if (!corp || !currency || !rate || !Number.isFinite(row.operatingCashIncomeLocal))
          throw new Error("Corporate tax cash quote unavailable");
        const plan = planCorporateTaxPriority({
          cash: corp.liquidCapital,
          pending: corp.pendingOperatingCash ?? 0,
          netIncome: row.operatingCashIncomeLocal!,
          localPerAnchor: rate,
          currentTax: Object.fromEntries(row.federalTaxByCountryAnchor ?? []),
          priorTax: corp.federalTaxArrearsAnchorByCountry ?? {},
          priorOperating: 0,
          priorOperatingByCurrency: Object.fromEntries(
            Object.entries(corp.operatingCashArrearsByCurrency ?? {})
              .filter(([, amount]) => amount > 0)
              .map(([code, amount]) => [
                code,
                {
                  amount: amount ?? 0,
                  localPerAnchor:
                    context.rates.get(code as CurrencyCode) ?? (code === currency ? rate : NaN),
                },
              ])
          ),
          distributionRequested: (row.deferredProducerDistributions ?? []).reduce(
            (sum, target) => sum + target.amountAnchor * rate,
            0
          ),
        });
        closing.set(corp._id.toHexString(), plan.cash);
        const inc: Record<string, number> = {
          liquidCapital: plan.cash - corp.liquidCapital,
          pendingOperatingCash: -(corp.pendingOperatingCash ?? 0),
          ["operatingCashArrearsByCurrency." + currency]: plan.operatingUnpaid,
        };
        for (const [code, amount] of Object.entries(plan.priorOperatingPaidByCurrency))
          inc["operatingCashArrearsByCurrency." + code] =
            (inc["operatingCashArrearsByCurrency." + code] ?? 0) - amount;
        const set: Record<string, unknown> = {
          updatedAt: now,
          ["operatingCashArrearsLastTurnByCurrency." + currency]: turn,
        };
        const countries = new Set([
          ...Object.keys(plan.currentUnpaid),
          ...Object.keys(plan.priorTaxPaid),
        ]);
        const legs: Document[] = [
          {
            account: `corporation:${corp._id}:${currency}`,
            amount: plan.cash - corp.liquidCapital - (corp.pendingOperatingCash ?? 0),
            currencyCode: currency,
            anchorAmount:
              (plan.cash - corp.liquidCapital - (corp.pendingOperatingCash ?? 0)) / rate,
            role: "primary",
          },
        ];
        for (const country of countries) {
          inc["federalTaxArrearsAnchorByCountry." + country] =
            (plan.currentUnpaid[country] ?? 0) - (plan.priorTaxPaid[country] ?? 0);
          set["federalTaxArrearsLastTurnByCountry." + country] = turn;
          const paid = (plan.currentPaid[country] ?? 0) + (plan.priorTaxPaid[country] ?? 0);
          if (!(paid > 0)) continue;
          const target =
            context.treasuryCurrencies.get(country) ??
            COUNTRY_CURRENCY_MAP[country as CountryId] ??
            currency;
          const targetRate = treasuryAnchorValuation({
            countryId: country,
            currencyCode: target,
            preset: context.preset,
            observedRate: context.rates.get(target),
          }).anchorRate;
          treasury.set(country, (treasury.get(country) ?? 0) + paid * targetRate);
          legs.push({
            account: `government_cash:${country}:${target}`,
            amount: paid * targetRate,
            currencyCode: target,
            anchorAmount: paid,
            role: "primary",
          });
        }
        const requestedDistribution = (row.deferredProducerDistributions ?? []).reduce(
          (sum, target) => sum + target.amountAnchor,
          0
        );
        for (const target of row.deferredProducerDistributions ?? []) {
          if (!(plan.distributionPaid > 0) || !(requestedDistribution > 0)) continue;
          const anchorAmount =
            ((plan.distributionPaid / rate) * target.amountAnchor) / requestedDistribution;
          const amount = anchorAmount * target.localPerAnchor;
          const previous = household.get(target.walletId);
          if (
            previous &&
            (previous.worldEpoch !== target.worldEpoch || previous.currency !== target.currency)
          )
            throw new Error("Corporate distribution wallet changed");
          household.set(target.walletId, {
            amount: (previous?.amount ?? 0) + amount,
            worldEpoch: target.worldEpoch,
            currency: target.currency,
          });
          legs.push({
            account: `economy_wallet:${target.walletId}:${target.currency}`,
            amount,
            currencyCode: target.currency,
            anchorAmount,
            role: "primary",
          });
        }
        if (plan.gross > 0)
          legs.push({
            account: `mint:corporate_${source}_income:` + currency,
            amount: -plan.gross,
            currencyCode: currency,
            anchorAmount: -plan.gross / rate,
            role: "contra",
          });
        const costs = plan.operatingPaid + plan.priorOperatingPaid;
        if (costs > 0)
          legs.push({
            account: "sink:corporate_operating_cost:" + currency,
            amount: costs,
            currencyCode: currency,
            anchorAmount: costs / rate,
            role: "contra",
          });
        corpOps.push({
          updateOne: { filter: { _id: corp._id }, update: { $inc: inc, $set: set } },
        });
        receipts.push({
          _id: key,
          kind: "corporate_tax_priority",
          turn,
          status: "applied",
          createdAt: now,
          completedAt: now,
          result: {
            currentPaid: plan.currentPaid,
            currentUnpaid: plan.currentUnpaid,
            priorTaxPaid: plan.priorTaxPaid,
            priorOperatingPaid: plan.priorOperatingPaid,
            cash: plan.cash,
          },
        });
        ledger.push({
          _id: idFor(key + ":ledger"),
          turn,
          createdAt: now,
          txType: "corp_tax_paid",
          legs,
          balanced: true,
          emitSite: "corporation/corporateTaxPriority",
        });
      }
      if (corpOps.length) {
        const updated = await db
          .collection<Corporation>("corporations")
          .bulkWrite(corpOps, { session });
        if (updated.matchedCount !== corpOps.length)
          throw new Error("Corporate tax payer disappeared");
      }
      const treasuryOps = [...treasury].map(([countryId, amount]) => ({
        updateOne: {
          filter: { countryId },
          update: {
            $inc: { treasuryCashLocal: amount, treasuryBalance: amount },
            $set: { updatedAt: now },
          },
        },
      }));
      if (treasuryOps.length) {
        const updated = await db.collection("federalBudget").bulkWrite(treasuryOps, { session });
        if (updated.matchedCount !== treasuryOps.length)
          throw new Error("Corporate tax Treasury unavailable");
      }
      if (household.size) {
        const operations = [...household].map(([id, target]) => ({
          updateOne: {
            filter: {
              _id: id as never,
              worldEpoch: target.worldEpoch,
              currency: target.currency,
            },
            update: { $inc: { cash: target.amount } },
          },
        }));
        const updated = await db
          .collection("producerEconomyAccounts")
          .bulkWrite(operations, { session });
        if (updated.matchedCount !== operations.length)
          throw new Error("Corporate distribution recipient unavailable");
      }
      if (ledger.length)
        await db.collection("ledgerEntries").bulkWrite(
          ledger.map((document) => ({ insertOne: { document } })),
          { session }
        );
      if (receipts.length)
        await db.collection("bankMoneyMoves").bulkWrite(
          receipts.map((document) => ({ insertOne: { document } })),
          { session }
        );
      return closing;
    },
    { client: db.client, timeoutMS: 60000, maxCommitTimeMS: 10000 }
  ).catch((error: unknown) => {
    throw new TurnMustStopError("corporateTaxPriority", error);
  });
}
