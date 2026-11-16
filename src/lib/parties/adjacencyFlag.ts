/** Read the operator setting without caching it across requests or turn passes. */
import type { Db } from "mongodb";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { partyAdjacencyEnabled } from "./rules/adjacencyGate";

export async function isPartyAdjacencyEnabled(db: Db): Promise<boolean> {
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { partyAdjacencyEnabled: 1 } }
  );
  return partyAdjacencyEnabled(config);
}
