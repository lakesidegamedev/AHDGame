import { getDb } from "@/lib/mongodb";
import { generateLandeslistenForCycle } from "@/lib/elections/germanyLandesliste";
import { ensureChamberElections } from "@/lib/turn/perpetualElections/chamberSpawner";
import { DE_BUNDESTAG_SPEC } from "./chamberSpecs";

/**
 * Ensure a live Bundestag election exists for every Bundesland, one multi-seat
 * race per Land sized by its Wahlkreise. The AMS list-tier reconciliation in
 * germanyAMS.ts runs after all 16 Land elections complete per cycle. A live or
 * resolved snap counts as the Land's current term (see `planNextLowerChamberCycle`).
 */
export async function ensureDEElections(now: Date, inFlightTurn?: number): Promise<void> {
  const spawned = await ensureChamberElections(DE_BUNDESTAG_SPEC, now, inFlightTurn);
  if (spawned.length === 0) return;

  // Seed Landeslisten for each newly spawned cycle so chairs have an edit window
  // before the AMS list tier consumes them. Idempotent and preserves edits.
  const db = await getDb();
  for (const cycle of new Set(spawned.map((e) => e.cycle))) {
    await generateLandeslistenForCycle(db, cycle);
  }
}
