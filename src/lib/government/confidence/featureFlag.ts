import type { Db } from "mongodb";
import { getGameConfigCollection } from "@/lib/db/collections/gameConfig";
import { governmentConfidenceEnabled } from "./rules/featureGate";

/** Read once per confidence batch, without caching operator changes. */
export async function isGovernmentConfidenceEnabled(db: Db): Promise<boolean> {
  const config = await (
    await getGameConfigCollection(db)
  ).findOne({ _id: "default" }, { projection: { governmentConfidenceEnabled: 1 } });
  return governmentConfidenceEnabled(config);
}
