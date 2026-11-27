/**
 * Clears the retired basket good from a live world: site stock, quotes,
 * listings, agreements, price rows, price history, flows and embargoes. Retail
 * sites keep their owner, capacity and location; they read the store recipe
 * from their sector type. Idempotent; `--apply` refuses while a turn runs.
 * Hosted production runs no startup migrations, so run it once by hand:
 *   npx tsx <this script> --dry-run
 *   npx tsx <this script> --apply
 */
import type { Db } from "mongodb";
import { connectDb, closeDb } from "../utils/db";

/** The retired commodity key. Spelled out here because the type no longer has it. */
export const RETIRED_BASKET_COMMODITY = "retail";

export interface MigrationReport {
  stockRows: number;
  quotes: number;
  listings: number;
  agreements: number;
  priceRows: number;
  priceHistoryRows: number;
  flowRows: number;
  embargoes: number;
  retailSites: number;
}

type Loose = Record<string, unknown>;

export async function retireRetailBaskets(
  db: Db,
  options: { apply: boolean }
): Promise<MigrationReport> {
  const key = RETIRED_BASKET_COMMODITY;
  const sectors = db.collection<Loose>("corporateSectors");
  const withStock = { "producerInventory.outputStock": { $elemMatch: { commodity: key } } };
  const withQuote = { [`producerQuotes.${key}`]: { $exists: true } };
  const byCommodity = { commodity: key };
  const sourceCounts = {
    stockRows: await sectors.countDocuments(withStock),
    quotes: await sectors.countDocuments(withQuote),
    listings: await db.collection("supplyListings").countDocuments(byCommodity),
    agreements: await db.collection("supplyAgreements").countDocuments(byCommodity),
    priceRows: await db.collection("commodityPrices").countDocuments(byCommodity),
    priceHistoryRows: await db.collection("commodityPriceHistory").countDocuments(byCommodity),
    flowRows: await db.collection("commodityFlows").countDocuments(byCommodity),
    embargoes: await db.collection("tradeEmbargoes").countDocuments(byCommodity),
    retailSites: await sectors.countDocuments({ sectorType: "retail" }),
  };
  if (!options.apply) return sourceCounts;
  await sectors.updateMany(withStock, {
    $pull: { "producerInventory.outputStock": { commodity: key } },
  } as never);
  await sectors.updateMany(withQuote, { $unset: { [`producerQuotes.${key}`]: "" } });
  for (const name of [
    "supplyListings",
    "supplyAgreements",
    "commodityPrices",
    "commodityPriceHistory",
    "commodityFlows",
    "tradeEmbargoes",
  ])
    await db.collection(name).deleteMany(byCommodity);
  return sourceCounts;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (apply && process.argv.includes("--dry-run"))
    throw new Error("Pass either --apply or --dry-run, not both");
  const db = await connectDb();
  try {
    if (apply) {
      const state = await db
        .collection<{ _id: string; isProcessing?: boolean }>("gameState")
        .findOne({ _id: "current" });
      if (state?.isProcessing) throw new Error("A turn is in flight; run again between turns");
    }
    const report = await retireRetailBaskets(db, { apply });
    console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", ...report }, null, 2));
  } finally {
    await closeDb();
  }
}

if (process.argv[1]?.endsWith("2026-11-25-retire-retail-baskets-stores.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
