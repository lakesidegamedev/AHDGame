import type { Db } from "mongodb";
import type { GameConfig } from "@/lib/db/types";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";

export async function persistCommodityNominalIndex(
  db: Db,
  index: number,
  turn: number
): Promise<void> {
  await gameConfigCollection(db).updateOne(
    { _id: "default" },
    { $set: { commodityNominalPriceIndex: index, commodityNominalPriceIndexTurn: turn } }
  );
}
