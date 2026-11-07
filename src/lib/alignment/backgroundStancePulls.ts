import type { Db } from "mongodb";
import type { AlignmentPoleId } from "@/lib/constants/alignmentEras";
import type { MacroCountryState } from "@/lib/world/macro/types";

/**
 * Per-turn alignment pull each 2027 background country's government applies
 * to its own row (#5702 section 5), as the macro kernel tick last stored it.
 *
 * One projected read, and none at all in a world whose poles the stance cannot
 * name (the bipolar Cold War era), so 1953 worlds pay nothing.
 */
export async function loadBackgroundStancePulls(
  db: Db,
  poles: readonly AlignmentPoleId[]
): Promise<Map<string, Partial<Record<AlignmentPoleId, number>>>> {
  const out = new Map<string, Partial<Record<AlignmentPoleId, number>>>();
  if (!poles.includes("WASHINGTON")) return out;
  const docs = await db
    .collection<MacroCountryState>("macroCountries")
    .find(
      {
        simulationTier: "background-macro",
        "foreignPolicy.alignmentPull": { $exists: true },
      } as never,
      { projection: { entityId: 1, "foreignPolicy.alignmentPull": 1 } }
    )
    .toArray();
  for (const doc of docs) {
    const pull: Partial<Record<AlignmentPoleId, number>> = {};
    for (const [pole, value] of Object.entries(doc.foreignPolicy?.alignmentPull ?? {})) {
      if (poles.includes(pole as AlignmentPoleId) && Number.isFinite(value) && value !== 0) {
        pull[pole as AlignmentPoleId] = value;
      }
    }
    if (Object.keys(pull).length > 0) out.set(String(doc.entityId), pull);
  }
  return out;
}
