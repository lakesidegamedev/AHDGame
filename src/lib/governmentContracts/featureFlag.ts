import type { Db } from "mongodb";
import type { GameConfig } from "@/lib/db/types";
import { governmentContractsEnabled } from "./rules/featureGate";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";

/** Read afresh for each command so the admin switch takes effect without a restart. */
export async function isGovernmentContractsEnabled(db: Db): Promise<boolean> {
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { governmentContractsEnabled: 1 } }
  );
  return governmentContractsEnabled(config);
}
