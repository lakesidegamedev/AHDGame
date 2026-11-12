import type { Db } from "mongodb";
import type { DisasterEffectEntry } from "@/lib/crises/disasterMarginPenalty";
import { LEVEL_SCAR_KINDS, scarOutputPoints } from "@/lib/crises/v2/scars";
import type { Crisis } from "@/lib/db/types/crisis";
import { crisesCollection } from "@/lib/db/repositories/crises";

/**
 * Standing output cuts from the scars of crises, active or over, by state. A
 * cut shrinks linearly to nothing over the scar's recovery. Targets that name a
 * country reach every one of its states.
 */
export async function loadScarOutputEntries(
  db: Db,
  turn: number,
  stateIdsByCountry: ReadonlyMap<string, readonly string[]>
): Promise<Map<string, DisasterEffectEntry[]>> {
  const result = new Map<string, DisasterEffectEntry[]>();
  const crises = await crisesCollection(db)
    .find({ scarsHealUntil: { $gte: turn } }, { projection: { "v2.scars": 1 } })
    .toArray();
  for (const crisis of crises) {
    for (const scar of crisis.v2?.scars ?? []) {
      if (!LEVEL_SCAR_KINDS.has(scar.kind)) continue;
      const points = scarOutputPoints(scar, turn);
      if (points >= 0) continue;
      const stateIds = stateIdsByCountry.get(scar.targetId) ?? [scar.targetId];
      for (const stateId of stateIds) {
        const list = result.get(stateId) ?? [];
        list.push({
          value: points,
          startTurn: scar.createdTurn,
          durationTurns: 0,
          sectorType: scar.sectorType ?? null,
          strategyId: null,
          physicality: "physical",
          persistent: true,
        });
        result.set(stateId, list);
      }
    }
  }
  return result;
}
