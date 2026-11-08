import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { FederalBudget } from "../types";

/** Typed `federalBudget` collection. Pass `db` when already connected to avoid an extra `getDb()` await. */
export async function getFederalBudgetCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<FederalBudget>("federalBudget");
}
