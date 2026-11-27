import type { Corporation } from "@/lib/db/types";
import type { Db, ObjectId, AnyBulkWriteOperation } from "mongodb";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";

/** Serialize frozen quote publication against wallet denomination changes in two bounded round trips. */
export async function fenceCorporateWallets(
  db: Db,
  wallets: Array<{ id: ObjectId; currency?: string }>
): Promise<void> {
  const unique = new Map<string, (typeof wallets)[number]>();
  for (const wallet of wallets) {
    const previous = unique.get(String(wallet.id));
    if (previous && previous.currency !== wallet.currency)
      throw new Error("Conflicting corporate wallet quotes");
    unique.set(String(wallet.id), wallet);
  }
  if (!unique.size) return;
  const corps = corporationsCollection(db);
  const rows = await corps
    .find(
      { _id: { $in: [...unique.values()].map((wallet) => wallet.id) } },
      { projection: { liquidCurrencyCode: 1, countryId: 1 } }
    )
    .toArray();
  if (rows.length !== unique.size) throw new Error("Corporate settlement wallet is unavailable");
  const operations = rows.map<AnyBulkWriteOperation<Corporation>>((corp) => {
    const expected = unique.get(String(corp._id))!.currency;
    const quotedCurrency = resolveCorpLiquidCurrencyCode(corp);
    if (expected && quotedCurrency !== expected)
      throw new Error("Corporate wallet currency changed before settlement");
    return {
      updateOne: {
        filter: {
          _id: corp._id,
          liquidCurrencyCode: corp.liquidCurrencyCode ?? { $exists: false },
        },
        update: {
          $inc: { currencySettlementRevision: 1 },
          ...(expected && !corp.liquidCurrencyCode
            ? { $set: { liquidCurrencyCode: quotedCurrency } }
            : {}),
        },
      },
    };
  });
  const saved = await corps.bulkWrite(operations);
  if (saved.matchedCount !== unique.size)
    throw new Error("Corporate wallet changed before settlement");
}
