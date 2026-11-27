import type { ObjectId } from "mongodb";
import type { CorporationHistory } from "@/lib/db/types";

export function corporationHistoryFixture(
  corporationId: ObjectId,
  turn: number,
  patch: Partial<Omit<CorporationHistory, "_id">> = {}
): Omit<CorporationHistory, "_id"> {
  return {
    corporationId,
    turn,
    sharePrice: 1,
    totalShares: 100,
    marketCap: 100,
    liquidCapital: 1000,
    revenue: 20,
    totalCosts: 10,
    income: 10,
    marketingStrength: 1,
    logisticsStrength: 1,
    dividendRate: 0,
    createdAt: new Date(0),
    currencyCode: "USD",
    fxRateAtWrite: 1,
    ...patch,
  };
}
