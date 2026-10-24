/**
 * Wind-up distributions pay corporate investors in their own cash currency.
 * Holder currencies are read together and payouts and witnesses are batched.
 * A holder whose corporation document is gone is skipped and reported, so one
 * unpayable claim cannot block the surviving holders' payout.
 */
import { ObjectId, type Db } from "mongodb";
import type {
  Corporation,
  IndexFund,
  IndexFundPosition,
  IndexFundTransaction,
} from "@/lib/db/types";
import {
  anchorToCorpLiquidCapital,
  loadFxRatesRecord,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { isForexEnabled } from "@/lib/currency/featureFlag";

export interface WindUpUnpaidClaim {
  positionId: ObjectId;
  holderKind: IndexFundPosition["holderKind"];
  units: number;
  amountAnchor: number;
}

export async function payCorporateWindUpHolders(
  db: Db,
  fund: IndexFund,
  positions: IndexFundPosition[],
  finalNav: number,
  turn: number,
  now: Date
): Promise<{
  holdersPaid: number;
  distributedAnchor: number;
  unpaidClaims: WindUpUnpaidClaim[];
}> {
  const corporatePositions = positions.filter((p) => p.holderKind === "corporation" && p.units > 0);
  if (!corporatePositions.length) return { holdersPaid: 0, distributedAnchor: 0, unpaidClaims: [] };
  const corporationIds = corporatePositions
    .map((p) => p.corporationId)
    .filter((id): id is ObjectId => Boolean(id));
  const corporations = corporationIds.length
    ? await db
        .collection<Corporation>("corporations")
        .find(
          { _id: { $in: corporationIds } },
          { projection: { liquidCurrencyCode: 1, countryId: 1 } }
        )
        .toArray()
    : [];
  const byId = new Map(corporations.map((c) => [c._id.toString(), c]));
  const forex = await isForexEnabled();
  const rates = forex ? await loadFxRatesRecord(db) : {};
  const operations: Array<{
    updateOne: {
      filter: { _id: ObjectId };
      update: { $inc: { liquidCapital: number }; $set: { updatedAt: Date } };
    };
  }> = [];
  const transactions: IndexFundTransaction[] = [];
  const unpaidClaims: WindUpUnpaidClaim[] = [];
  let distributedAnchor = 0;
  for (const position of corporatePositions) {
    const corp = position.corporationId ? byId.get(position.corporationId.toString()) : undefined;
    const amountAnchor =
      fund.seedAccounting === "paid_units"
        ? position.units * finalNav
        : Math.floor(position.units * finalNav);
    if (amountAnchor <= 0) continue;
    if (!corp) {
      unpaidClaims.push({
        positionId: position._id,
        holderKind: position.holderKind,
        units: position.units,
        amountAnchor,
      });
      continue;
    }
    const currency = resolveCorpLiquidCurrencyCode(corp);
    const rate = forex && currency ? rates[currency] : 1;
    if (!rate || !Number.isFinite(rate) || rate <= 0)
      throw new Error("Corporate payout exchange rate unavailable");
    operations.push({
      updateOne: {
        filter: { _id: corp._id },
        update: {
          $inc: { liquidCapital: anchorToCorpLiquidCapital(amountAnchor, corp, rate) },
          $set: { updatedAt: now },
        },
      },
    });
    transactions.push({
      _id: new ObjectId(),
      fundId: fund._id,
      corporationId: corp._id,
      holderKind: "corporation",
      kind: "wind_up_distribution",
      turn,
      units: position.units,
      amountAnchor,
      note: `Wind-up distribution from ${fund.name}`,
      createdAt: now,
    });
    distributedAnchor += amountAnchor;
  }
  if (operations.length) {
    const credited = await db.collection("corporations").bulkWrite(operations);
    if (credited.matchedCount !== operations.length)
      throw new Error("Corporate fund payout failed");
    await db.collection<IndexFundTransaction>("indexFundTransactions").insertMany(transactions);
  }
  return { holdersPaid: operations.length, distributedAnchor, unpaidClaims };
}
