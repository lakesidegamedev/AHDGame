import type { Db } from "mongodb";
import type { UKGovernment } from "@/lib/db/types/ukGovernment";

import type { UKCabinetCooldown } from "@/lib/db/types/ukCabinetCooldown";
import { ukCabinetCooldownsCollection } from "@/lib/db/repositories/ukCabinetCooldowns";
import { ukGovernmentCollection } from "@/lib/db/repositories/ukGovernment";

export function getUKGovernmentCollection(db: Db) {
  return ukGovernmentCollection<UKGovernment>(db);
}

export function getUKCabinetCooldownsCollection(db: Db) {
  return ukCabinetCooldownsCollection<UKCabinetCooldown>(db);
}
