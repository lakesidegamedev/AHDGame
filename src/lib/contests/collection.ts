import type { Db } from "mongodb";
import type { ContestRound } from "@/lib/db/types/contestRound";
import { contestRoundsCollection } from "@/lib/db/repositories/contestRounds";

export function getContestRoundsCollection(db: Db) {
  return contestRoundsCollection<ContestRound>(db);
}
