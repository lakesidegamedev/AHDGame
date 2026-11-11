import type { Db } from "mongodb";
import type { UKGovernment } from "@/lib/db/types/ukGovernment";

import type { UKCabinetCooldown } from "@/lib/db/types/ukCabinetCooldown";
import { ukCabinetCooldownsCollection } from "@/lib/db/repositories/ukCabinetCooldowns";

export function getUKGovernmentCollection(db: Db) {
  return db.collection<UKGovernment>("ukGovernment");
}

export function getUKCabinetCooldownsCollection(db: Db) {
  return ukCabinetCooldownsCollection<UKCabinetCooldown>(db);
}
