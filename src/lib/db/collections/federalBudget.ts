import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { federalBudgetCollection } from "../repositories/federalBudget";

/** Typed `federalBudget` collection. Pass `db` when already connected to avoid an extra `getDb()` await. */
export async function getFederalBudgetCollection(db?: Db) {
  return federalBudgetCollection(db ?? (await getDb()));
}
