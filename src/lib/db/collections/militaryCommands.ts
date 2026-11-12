import type { Db } from "mongodb";
import type { MilitaryCommandsDoc } from "@/lib/db/types/militaryCommands";
import type { MilitaryCommand } from "@/lib/military/types";
import type { CountryId } from "@/lib/constants/countries";

export function getMilitaryCommandsCollection(db: Db) {
  return db.collection<MilitaryCommandsDoc>("militaryCommands");
}

/** The stored per-country commands, or [] when none exists (upserted on first save). */
export async function getMilitaryCommands(db: Db, countryId: string): Promise<MilitaryCommand[]> {
  const doc = await getMilitaryCommandsCollection(db).findOne({
    countryId: countryId as CountryId,
  });
  // Absent commandingGeneralId defaults to the first commander; explicit null stays null.
  // A general may lead only one command (enforced on write); duplicates from legacy
  // data must be dropped here or saves echo back a 400.
  const seenLead = new Set<string>();
  return (doc?.commands ?? []).map((c) => {
    const derived =
      c.commandingGeneralId === undefined ? (c.commanderIds[0] ?? null) : c.commandingGeneralId;
    if (derived === null) return { ...c, commandingGeneralId: null };
    if (seenLead.has(derived)) return { ...c, commandingGeneralId: null };
    seenLead.add(derived);
    return { ...c, commandingGeneralId: derived };
  });
}
