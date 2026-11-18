import type { Db, ObjectId } from "mongodb";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";

/** Load the strongest party office for each holder outside the founding phase. */
export async function loadPartyPositionNiBonuses(
  db: Db,
  founding: boolean,
  characterId?: ObjectId
): Promise<Map<string, number>> {
  const bonuses = new Map<string, number>();
  if (founding) return bonuses;

  const holder = characterId ?? { $ne: null };
  const [nationalOffices, stateOffices] = await Promise.all([
    politicalPartiesCollection(db)
      .find(
        { $or: [{ chairId: holder }, { viceChairId: holder }, { treasurerId: holder }] },
        { projection: { chairId: 1, viceChairId: 1, treasurerId: 1 } }
      )
      .toArray(),
    statePartyOrgCollection(db)
      .find({ chairId: holder }, { projection: { chairId: 1 } })
      .toArray(),
  ]);

  const selectedId = characterId?.toString();
  function record(id: ObjectId | null, bonus: number) {
    if (!id) return;
    const key = id.toString();
    if (selectedId && key !== selectedId) return;
    bonuses.set(key, Math.max(bonuses.get(key) ?? 0, bonus));
  }

  for (const row of stateOffices) record(row.chairId, 0.5);
  for (const party of nationalOffices) {
    record(party.chairId, 2);
    record(party.viceChairId, 1.5);
    record(party.treasurerId, 1.5);
  }

  return bonuses;
}
