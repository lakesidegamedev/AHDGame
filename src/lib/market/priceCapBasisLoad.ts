import type { Db } from "mongodb";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { resolvePriceCapBasis, type PriceCapBasis } from "./priceCapBasis";

export async function loadPriceCapBasis(db: Db): Promise<PriceCapBasis> {
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" } as Record<string, unknown>,
    { projection: { producerPriceMaxMultiplier: 1, commodityNominalPriceIndex: 1 } }
  );
  return resolvePriceCapBasis(config);
}
