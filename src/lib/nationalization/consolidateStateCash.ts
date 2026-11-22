/** Transfer residual state-company cash at its frozen FX basis before deleting an empty shell. */
import type { Db, ObjectId } from "mongodb";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import {
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
  corpLiquidCapitalToAnchor,
  anchorToCorpLiquidCapital,
} from "@/lib/currency/corporationCapital";
import { runWithDbSession } from "@/lib/db/sessionDb";

export async function consolidateStateCash(
  db: Db,
  fromId: ObjectId,
  toId: ObjectId
): Promise<void> {
  const coll = corporationsCollection(db);
  const preview = await coll.findOne({ _id: fromId }, { projection: { liquidCapital: 1 } });
  if (!preview?.liquidCapital) return;
  const rates = await loadFxRatesByCurrency(db);
  await runWithDbSession(
    db,
    async (session) => {
      const source = await coll.findOne(
        { _id: fromId },
        { session, projection: { liquidCapital: 1, liquidCurrencyCode: 1, countryId: 1 } }
      );
      const target = await coll.findOne(
        { _id: toId },
        { session, projection: { liquidCapital: 1, liquidCurrencyCode: 1, countryId: 1 } }
      );
      if (!source || !target) throw new Error("State-company cash successor is missing");
      const sourceCode = resolveCorpLiquidCurrencyCode(source),
        targetCode = resolveCorpLiquidCurrencyCode(target);
      const sourceRate = sourceCode ? rates.get(sourceCode) : 1,
        targetRate = targetCode ? rates.get(targetCode) : 1;
      const cash = source.liquidCapital ?? 0;
      if (!Number.isFinite(cash) || !(sourceRate && sourceRate > 0 && targetRate && targetRate > 0))
        throw new Error("Invalid state-company cash valuation");
      const converted = anchorToCorpLiquidCapital(
        corpLiquidCapitalToAnchor(cash, source, sourceRate),
        target,
        targetRate
      );
      if (!Number.isFinite(converted) || !Number.isFinite((target.liquidCapital ?? 0) + converted))
        throw new Error("Invalid successor cash balance");
      const debit = await coll.updateOne(
        { _id: fromId },
        { $inc: { liquidCapital: -cash } },
        { session }
      );
      const credit = await coll.updateOne(
        { _id: toId },
        {
          $inc: {
            liquidCapital: converted,
          },
        },
        { session }
      );
      if (debit.matchedCount !== 1 || credit.matchedCount !== 1)
        throw new Error("Missing state-company cash account");
    },
    { client: db.client }
  );
}
