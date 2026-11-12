import type { Db } from "mongodb";
import type { LeaderLegacy } from "@/lib/db/types/leaderLegacy";

export function getLeaderLegaciesCollection(db: Db) {
  return db.collection<LeaderLegacy>("leaderLegacies");
}
