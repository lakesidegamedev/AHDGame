import type { Db } from "mongodb";
import { decodeReceipt } from "@/lib/market/producerMarket/receiptStorage";
import { excludedEntrantOpening } from "@/lib/market/producerMarket/rules/excludedEntrant";
import { producerEconomyTurnsCollection } from "@/lib/db/repositories/producerEconomyTurns";
import type { CorporationLookups } from "./types";

export async function reconcileExcludedEntrants(
  db: Db,
  lookups: CorporationLookups,
  worldEpoch: string,
  turn: number,
  openingTurn: number
): Promise<ReadonlyMap<string, number>> {
  const candidates = [...lookups.sectorsByCorp.values()]
    .flat()
    .filter((s) => excludedEntrantOpening(s, worldEpoch, turn, openingTurn, false) != null);
  if (!candidates.length) return new Map();
  const record = await producerEconomyTurnsCollection<{
    _id: string;
    payload: string;
    digest: string;
    status: string;
  }>(db).findOne(
    { _id: JSON.stringify([worldEpoch, openingTurn]), status: "settled" },
    { projection: { payload: 1, digest: 1, status: 1 } }
  );
  if (!record) return new Map();
  const targets = (await decodeReceipt(
    db,
    record,
    (root) => (root as { targets: unknown }).targets
  )) as { sectorId: string }[];
  const included = new Set(targets.map((t) => t.sectorId));
  return new Map(
    candidates.flatMap((sector) => {
      const id = sector._id.toHexString();
      const opening = excludedEntrantOpening(
        sector,
        worldEpoch,
        turn,
        openingTurn,
        included.has(id)
      );
      return opening == null ? [] : [[id, opening] as const];
    })
  );
}
