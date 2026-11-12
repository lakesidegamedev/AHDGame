import type { Db } from "mongodb";
import type { UkCommonsVacancy, UkRecallPetition } from "@/lib/db/types/ukByElection";
import { ukCommonsVacanciesCollection } from "@/lib/db/repositories/ukCommonsVacancies";
import { ukRecallPetitionsCollection } from "@/lib/db/repositories/ukRecallPetitions";

export function getUkCommonsVacanciesCollection(db: Db) {
  return ukCommonsVacanciesCollection<UkCommonsVacancy>(db);
}

export function getUkRecallPetitionsCollection(db: Db) {
  return ukRecallPetitionsCollection<UkRecallPetition>(db);
}
