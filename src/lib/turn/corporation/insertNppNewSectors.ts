import type { Db } from "mongodb";
import { producerWorldEpochIfReady } from "@/lib/demographics/worldEpoch";
import type { CorporateSector } from "@/lib/db/types";
import { emptyProducerSectorOpening } from "@/lib/market/producerMarket/openingState";

/**
 * Insert sectors the NPP brain founded this turn. Under plants each new site
 * opens on the current world economy generation with an empty producer state.
 */
// PLANTS-GATED: write half of the founding insert whose document half lives
// in `nppCorporationBehavior.buildNppSectorDocs`. Docs carry `revenue`, so
// this is a registered `corporateSectors.revenue` writer, see
// `sectorRevenueWriters.guard.test.ts`. Under plants that figure is the legacy nameplate only; `sectorTurn`
// restates `revenue` from capacity next tick. Below plants the nameplate is
// the operative figure. The quantity that matters is written by the builder,
// not here.
export async function insertNppNewSectors(
  db: Db,
  sectors: readonly CorporateSector[],
  args: { plantsEnabled: boolean; worldEpochId?: string | null; turn: number }
): Promise<void> {
  if (sectors.length === 0) return;
  let rows: CorporateSector[] = [...sectors];
  if (args.plantsEnabled) {
    const worldEpoch = await producerWorldEpochIfReady(db, {
      worldEpochId: args.worldEpochId ?? undefined,
    });
    if (worldEpoch)
      rows = rows.map((sector) => ({
        ...sector,
        ...emptyProducerSectorOpening(worldEpoch, args.turn),
      }));
  }
  await db.collection<CorporateSector>("corporateSectors").insertMany(rows);
}
