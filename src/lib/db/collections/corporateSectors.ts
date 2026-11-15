import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { CorporateSector } from "../types";

/** Typed `corporateSectors` collection. Pass `db` when already connected to avoid an extra `getDb()` await. */
export async function getCorporateSectorsCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<CorporateSector>("corporateSectors");
}

/** A sector without its heavy build queue, plant ledger and per-commodity sales. */
export const CORPORATE_SECTOR_LEAN_FIELDS = {
  buildQueue: 0,
  plantsPnl: 0,
  soldByCommodity: 0,
} as const;
