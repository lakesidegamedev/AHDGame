import type { Db } from "mongodb";
import type { BasingAgreement } from "@/lib/navair/rules/supply";

export function getNavairBasingCollection(db: Db) {
  return db.collection<BasingAgreement>("navairBasing");
}

export async function loadNavairBasing(db: Db): Promise<BasingAgreement[]> {
  return getNavairBasingCollection(db).find({ status: "active" }).toArray();
}
