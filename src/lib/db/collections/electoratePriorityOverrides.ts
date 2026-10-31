import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { ElectoratePriorityOverride } from "@/lib/db/types/electoratePriorityOverride";

export async function getElectoratePriorityOverridesCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<ElectoratePriorityOverride>("electoratePriorityOverrides");
}
