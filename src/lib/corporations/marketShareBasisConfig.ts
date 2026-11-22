import type { Db } from "mongodb";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import {
  marketShareBasisFromStage,
  type MarketShareBasis,
} from "@/lib/corporations/rules/marketShareBasis";

/**
 * The share basis in force, read once from gameConfig. An unreadable config
 * keeps the capacity basis so a failed read never changes a mechanic.
 */
export async function loadMarketShareBasis(db: Db): Promise<MarketShareBasis> {
  try {
    const doc = await gameConfigCollection<{ marketShareEarnedStage?: number }>(db).findOne(
      { _id: "default" as never },
      { projection: { marketShareEarnedStage: 1 } }
    );
    return marketShareBasisFromStage(doc?.marketShareEarnedStage);
  } catch {
    return "capacity";
  }
}
