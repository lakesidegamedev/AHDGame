import type { Db } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { emptyProducerSectorOpening } from "@/lib/market/producerMarket/openingState";

/**
 * Insert sectors the NPP brain founded this turn. Under plants each new site
 * opens on the current world economy generation with an empty producer state.
 */
export async function insertNppNewSectors(
  db: Db,
  sectors: readonly CorporateSector[],
  args: { plantsEnabled: boolean; worldEpochId?: string | null; turn: number }
): Promise<void> {
  if (sectors.length === 0) return;
  let rows: CorporateSector[] = [...sectors];
  if (args.plantsEnabled) {
    if (!args.worldEpochId)
      throw new Error("Producer site founding requires a world economy generation");
    const worldEpoch = args.worldEpochId;
    rows = rows.map((sector) => ({
      ...sector,
      ...emptyProducerSectorOpening(worldEpoch, args.turn),
    }));
  }
  await db.collection<CorporateSector>("corporateSectors").insertMany(rows);
}
