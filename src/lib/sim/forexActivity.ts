/**
 * Database reader for the forex activity record (issue #2293). The rule lives
 * in `rules/forexActivity.ts`; this shell only gathers the rows.
 */
import type { Db } from "mongodb";
import type { CurrencyOrder } from "@/lib/db/types/currencyOrder";
import type { ExchangeRate } from "@/lib/db/types/exchangeRate";
import type { TradeHistoryEntry } from "@/lib/db/types/tradeHistory";
import { summarizeForexActivity, type ForexActivityRecord } from "@/lib/sim/rules/forexActivity";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { currencyOrdersCollection } from "@/lib/db/repositories/currencyOrders";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";

export async function collectForexActivity(db: Db): Promise<ForexActivityRecord> {
  const [state, orders, trades, rates] = await Promise.all([
    gameStateCollection<{ forexEnabled?: boolean }>(db).findOne({ _id: "current" } as never, {
      projection: { forexEnabled: 1 },
    }),
    currencyOrdersCollection(db)
      .find({}, { projection: { status: 1, amount: 1, filledAmount: 1 } })
      .toArray(),
    db
      .collection<TradeHistoryEntry>("tradeHistory")
      .find({}, { projection: { amount: 1, rate: 1, spread: 1 } })
      .toArray(),
    exchangeRatesCollection(db)
      .find({}, { projection: { "interventionPolicy.recentInterventions": 1 } })
      .toArray(),
  ]);
  const interventionCount = rates.reduce(
    (sum, rate) => sum + (rate.interventionPolicy?.recentInterventions?.length ?? 0),
    0
  );
  return summarizeForexActivity({
    forexEnabled: state?.forexEnabled === true,
    orders,
    trades,
    interventionCount,
  });
}
